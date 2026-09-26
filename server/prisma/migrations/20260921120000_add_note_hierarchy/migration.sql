-- Add Group/Sub-Group models for Perfume Notes hierarchy
-- Safe additive migration - does not modify existing data

-- CreateTable
CREATE TABLE "PerfumeNoteGroup" (
    "id" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfumeNoteGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfumeNoteSubGroup" (
    "id" TEXT NOT NULL,
    "subGroupCode" TEXT NOT NULL,
    "subGroupName" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfumeNoteSubGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerfumeNoteGroup_groupCode_key" ON "PerfumeNoteGroup"("groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "PerfumeNoteSubGroup_subGroupCode_key" ON "PerfumeNoteSubGroup"("subGroupCode");

-- CreateIndex
CREATE INDEX "PerfumeNoteSubGroup_groupId_idx" ON "PerfumeNoteSubGroup"("groupId");

-- AddForeignKey
ALTER TABLE "PerfumeNoteSubGroup" ADD CONSTRAINT "PerfumeNoteSubGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PerfumeNoteGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add columns to FragranceNote (if they don't already exist)
ALTER TABLE "FragranceNote" ADD COLUMN "groupId" TEXT;
ALTER TABLE "FragranceNote" ADD COLUMN "subGroupId" TEXT;
ALTER TABLE "FragranceNote" ADD COLUMN "examples" TEXT;
ALTER TABLE "FragranceNote" ADD COLUMN "color" TEXT;
ALTER TABLE "FragranceNote" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "FragranceNote" ADD COLUMN "keywords" TEXT;

-- CreateIndex
CREATE INDEX "FragranceNote_groupId_idx" ON "FragranceNote"("groupId");
CREATE INDEX "FragranceNote_subGroupId_idx" ON "FragranceNote"("subGroupId");

-- AddForeignKey
ALTER TABLE "FragranceNote" ADD CONSTRAINT "FragranceNote_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PerfumeNoteGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FragranceNote" ADD CONSTRAINT "FragranceNote_subGroupId_fkey" FOREIGN KEY ("subGroupId") REFERENCES "PerfumeNoteSubGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
