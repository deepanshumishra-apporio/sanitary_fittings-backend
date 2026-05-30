-- Remove parent category concept from Category table.
-- Categories are now flat; the self-referential tree (parent/children) is no longer used.

-- Step 1: Drop the self-referential foreign key constraint first.
ALTER TABLE "Category" DROP CONSTRAINT "Category_parentId_fkey";

-- Step 2: Drop the parentId column.
ALTER TABLE "Category" DROP COLUMN "parentId";
