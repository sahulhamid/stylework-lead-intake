-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LEAD_CREATED', 'LEAD_UPDATED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "meta_lead_id" TEXT NOT NULL,
    "form_id" TEXT,
    "ad_id" TEXT,
    "campaign_id" TEXT,
    "page_id" TEXT,
    "meta_created_at" TIMESTAMPTZ(3),
    "full_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "raw_payload" JSONB NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "actor" TEXT NOT NULL,
    "from_status" "LeadStatus",
    "to_status" "LeadStatus",
    "changes" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_meta_lead_id_key" ON "leads"("meta_lead_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
