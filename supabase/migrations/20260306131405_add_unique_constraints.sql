-- Thêm ràng buộc UNIQUE cho DailyAttendance
ALTER TABLE "DailyAttendance"
ADD CONSTRAINT dailyattendance_employee_date_unique UNIQUE (employee_id, date);

-- Thêm ràng buộc UNIQUE cho TurnQueue
ALTER TABLE "TurnQueue"
ADD CONSTRAINT turnqueue_employee_date_unique UNIQUE (employee_id, date);
