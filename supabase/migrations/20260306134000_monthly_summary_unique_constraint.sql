-- Thêm ràng buộc UNIQUE cho bảng MonthlyAttendanceSummary (để sửa lỗi Trigger ON CONFLICT)
ALTER TABLE "MonthlyAttendanceSummary"
ADD CONSTRAINT monthlyattendancesummary_emp_month_unique UNIQUE (employee_id, month);
