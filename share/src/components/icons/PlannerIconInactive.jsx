const PlannerIconInactive = ({ className, width = 18, height = 20, stroke = "#0F87F9", ...props }) => (
  <svg 
    width={width} 
    height={height} 
    viewBox="0 0 18 20" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M5.5 0.5V2.5H12.5V0.5H13.5V2.5H16C16.8269 2.5 17.5 3.17314 17.5 4V18C17.5 18.8269 16.8269 19.5 16 19.5H2C1.17314 19.5 0.5 18.8269 0.5 18V4C0.5 3.17314 1.17314 2.5 2 2.5H4.5V0.5H5.5ZM3.5 16.5H6.5V13.5H3.5V16.5ZM7.5 16.5H10.5V13.5H7.5V16.5ZM11.5 16.5H14.5V13.5H11.5V16.5ZM3.5 12.5H6.5V9.5H3.5V12.5ZM7.5 12.5H10.5V9.5H7.5V12.5ZM11.5 12.5H14.5V9.5H11.5V12.5ZM1.5 7.5H16.5V4.5H1.5V7.5Z" stroke={stroke} />
  </svg>
);

export default PlannerIconInactive;
