"use client";

import DatePicker, { type DatePickerProps } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function DatesRangePickerInline(props: DatePickerProps) {
  return <DatePicker {...props} />;
}
