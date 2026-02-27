-- Migration script to add sleep_quality and wake_up_mood columns to baby_logs table

-- This script will add two new columns to the existing baby_logs table. 
-- sleep_quality will be a VARCHAR data type (for descriptive values)  
-- wake_up_mood will be a VARCHAR data type as well (for describing the mood upon waking)

ALTER TABLE baby_logs
ADD COLUMN sleep_quality VARCHAR(50),
ADD COLUMN wake_up_mood VARCHAR(50);

-- Migration completed successfully on 2026-02-27 11:19:21 UTC