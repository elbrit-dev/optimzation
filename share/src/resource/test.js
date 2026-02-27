const data = [
    // January 2024 - Week 1
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-02", qty: 52, amount: 3343.08, sales: 4680, target: 5000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-01-03", qty: 88, amount: 4162.40, sales: 6000, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-01-04", qty: 43, amount: 4426.98, sales: 6200, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-05", qty: 64, amount: 4117.44, sales: 5760, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-01-06", qty: 70, amount: 3311.00, sales: 4800, target: 6500 },
    
    // January 2024 - Week 2
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-01-07", qty: 57, amount: 5863.02, sales: 8200, target: 8000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-01-08", qty: 46, amount: 2957.34, sales: 4140, target: 4800 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-09", qty: 81, amount: 3829.05, sales: 5500, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-01-10", qty: 54, amount: 5556.24, sales: 7800, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-01-11", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    
    // January 2024 - Week 3
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-01-14", qty: 73, amount: 3454.30, sales: 5000, target: 6500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-15", qty: 50, amount: 5143.00, sales: 7200, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-01-16", qty: 49, amount: 3150.21, sales: 4410, target: 5000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2024-01-17", qty: 87, amount: 4115.15, sales: 5900, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-01-18", qty: 45, amount: 4633.70, sales: 6500, target: 6000 },
    
    // January 2024 - Week 4
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-21", qty: 61, amount: 3920.49, sales: 5490, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-01-22", qty: 79, amount: 3739.70, sales: 5400, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-01-23", qty: 56, amount: 5764.48, sales: 8050, target: 8000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-01-24", qty: 47, amount: 3022.23, sales: 4230, target: 4800 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-25", qty: 83, amount: 3926.35, sales: 5650, target: 7000 },
    
    // January 2024 - Week 5
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-01-28", qty: 52, amount: 5353.36, sales: 7500, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-01-29", qty: 59, amount: 3792.51, sales: 5310, target: 5500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-01-30", qty: 75, amount: 3547.50, sales: 5100, target: 6500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-01-31", qty: 60, amount: 6171.60, sales: 8600, target: 8000 },
    
    // October 2024 - Week 1
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-01", qty: 50, amount: 3214.50, sales: 4500, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-02", qty: 75, amount: 3547.50, sales: 5200, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-10-03", qty: 30, amount: 3085.80, sales: 4200, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-10-04", qty: 45, amount: 2893.05, sales: 4050, target: 4800 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-10-05", qty: 60, amount: 2838.00, sales: 4100, target: 5500 },
    
    // October 2024 - Week 2
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-08", qty: 40, amount: 4114.40, sales: 5800, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-10-09", qty: 55, amount: 3535.95, sales: 4950, target: 5200 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2024-10-10", qty: 80, amount: 3784.00, sales: 5400, target: 6500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-10-11", qty: 35, amount: 3600.10, sales: 5000, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-12", qty: 65, amount: 4178.85, sales: 5850, target: 6000 },
    
    // October 2024 - Week 3
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-10-15", qty: 70, amount: 3311.00, sales: 4800, target: 5800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-10-16", qty: 50, amount: 5143.00, sales: 7200, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-10-17", qty: 40, amount: 2571.60, sales: 3600, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-18", qty: 90, amount: 4257.00, sales: 6000, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-10-19", qty: 45, amount: 4630.50, sales: 6500, target: 6000 },
    
    // October 2024 - Week 4
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-10-22", qty: 55, amount: 3535.95, sales: 4950, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-10-23", qty: 65, amount: 3074.50, sales: 4400, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-24", qty: 60, amount: 6171.60, sales: 8600, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-10-25", qty: 50, amount: 3214.50, sales: 4500, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2024-10-26", qty: 85, amount: 4020.50, sales: 5700, target: 7000 },
    
    // October 2024 - Week 5
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-10-29", qty: 38, amount: 3910.68, sales: 5500, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-10-30", qty: 48, amount: 3085.92, sales: 4320, target: 4800 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-10-31", qty: 72, amount: 3405.60, sales: 4900, target: 6500 },
    
    // November 2024 - Week 1
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-11-01", qty: 55, amount: 5657.30, sales: 7900, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-11-02", qty: 42, amount: 2700.18, sales: 3780, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-11-05", qty: 68, amount: 3218.40, sales: 4600, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-11-06", qty: 52, amount: 5353.36, sales: 7500, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-11-07", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    
    // November 2024 - Week 2
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-11-08", qty: 75, amount: 3547.50, sales: 5100, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-11-09", qty: 48, amount: 4940.16, sales: 6900, target: 6500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-11-12", qty: 46, amount: 2957.34, sales: 4140, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2024-11-13", qty: 82, amount: 3877.40, sales: 5600, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-11-14", qty: 44, amount: 4532.32, sales: 6350, target: 6000 },
    
    // November 2024 - Week 3
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-11-15", qty: 62, amount: 3985.98, sales: 5580, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-11-16", qty: 78, amount: 3689.40, sales: 5300, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-11-19", qty: 56, amount: 5764.48, sales: 8050, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-11-20", qty: 40, amount: 2571.60, sales: 3600, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-11-21", qty: 88, amount: 4162.40, sales: 6000, target: 7500 },
    
    // November 2024 - Week 4
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-11-22", qty: 50, amount: 5143.00, sales: 7200, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-11-23", qty: 54, amount: 3471.66, sales: 4860, target: 5200 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-11-26", qty: 70, amount: 3311.00, sales: 4800, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-11-27", qty: 64, amount: 6590.08, sales: 9200, target: 8500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-11-28", qty: 52, amount: 3343.08, sales: 4680, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2024-11-29", qty: 86, amount: 4070.60, sales: 5800, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-11-30", qty: 41, amount: 4217.26, sales: 5900, target: 5500 },
    
    // December 2024 - Week 1
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-12-01", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-12-02", qty: 72, amount: 3405.60, sales: 4900, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-12-03", qty: 49, amount: 5040.14, sales: 7050, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-12-04", qty: 44, amount: 2830.76, sales: 3960, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-12-05", qty: 80, amount: 3784.00, sales: 5400, target: 7000 },
    
    // December 2024 - Week 2
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-12-06", qty: 53, amount: 5453.58, sales: 7600, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-12-07", qty: 56, amount: 3600.24, sales: 5040, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-12-10", qty: 68, amount: 3218.40, sales: 4600, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-12-11", qty: 47, amount: 4838.42, sales: 6750, target: 6500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2024-12-12", qty: 50, amount: 3214.50, sales: 4500, target: 5000 },
    
    // December 2024 - Week 3
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2024-12-13", qty: 84, amount: 3973.20, sales: 5700, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-12-14", qty: 46, amount: 4735.56, sales: 6600, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2024-12-17", qty: 60, amount: 3857.40, sales: 5400, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2024-12-18", qty: 74, amount: 3500.20, sales: 5050, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2024-12-19", qty: 51, amount: 5247.86, sales: 7350, target: 7500 },
    
    // December 2024 - Week 4
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-12-20", qty: 48, amount: 3085.92, sales: 4320, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-12-21", qty: 82, amount: 3877.40, sales: 5600, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2024-12-24", qty: 55, amount: 5666.50, sales: 7900, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2024-12-27", qty: 54, amount: 3471.66, sales: 4860, target: 5200 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2024-12-28", qty: 76, amount: 3599.80, sales: 5200, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2024-12-31", qty: 59, amount: 6073.62, sales: 8500, target: 8000 },
    
    // January 2025 - Week 1
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-01-02", qty: 52, amount: 3343.08, sales: 4680, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-01-03", qty: 88, amount: 4162.40, sales: 6000, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-01-04", qty: 43, amount: 4426.98, sales: 6200, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-01-05", qty: 64, amount: 4117.44, sales: 5760, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-01-06", qty: 70, amount: 3311.00, sales: 4800, target: 6500 },
    
    // January 2025 - Week 2
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-01-07", qty: 57, amount: 5863.02, sales: 8200, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-01-08", qty: 46, amount: 2957.34, sales: 4140, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-01-09", qty: 81, amount: 3829.05, sales: 5500, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-01-10", qty: 54, amount: 5556.24, sales: 7800, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-01-11", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    
    // January 2025 - Week 3
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-01-14", qty: 73, amount: 3454.30, sales: 5000, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-01-15", qty: 50, amount: 5143.00, sales: 7200, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-01-16", qty: 49, amount: 3150.21, sales: 4410, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-01-17", qty: 87, amount: 4115.15, sales: 5900, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-01-18", qty: 45, amount: 4633.70, sales: 6500, target: 6000 },
    
    // January 2025 - Week 4
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-01-21", qty: 61, amount: 3920.49, sales: 5490, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-01-22", qty: 79, amount: 3739.70, sales: 5400, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-01-23", qty: 56, amount: 5764.48, sales: 8050, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-01-24", qty: 47, amount: 3022.23, sales: 4230, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-01-25", qty: 83, amount: 3926.35, sales: 5650, target: 7000 },
    
    // January 2025 - Week 5
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-01-28", qty: 52, amount: 5353.36, sales: 7500, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-01-29", qty: 59, amount: 3792.51, sales: 5310, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-01-30", qty: 75, amount: 3547.50, sales: 5100, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-01-31", qty: 60, amount: 6171.60, sales: 8600, target: 8000 },
    
    // October 2025 - Week 1
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-01", qty: 55, amount: 3535.95, sales: 4950, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-10-02", qty: 65, amount: 3074.50, sales: 4400, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-03", qty: 60, amount: 6171.60, sales: 8600, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-10-04", qty: 50, amount: 3214.50, sales: 4500, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-10-05", qty: 85, amount: 4020.50, sales: 5700, target: 7000 },
    
    // October 2025 - Week 2
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-10-08", qty: 38, amount: 3910.68, sales: 5500, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-09", qty: 48, amount: 3085.92, sales: 4320, target: 4800 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-10-10", qty: 72, amount: 3405.60, sales: 4900, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-10-11", qty: 55, amount: 5657.30, sales: 7900, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-10-12", qty: 42, amount: 2700.18, sales: 3780, target: 4500 },
    
    // October 2025 - Week 3
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-15", qty: 68, amount: 3218.40, sales: 4600, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-10-16", qty: 52, amount: 5353.36, sales: 7500, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-10-17", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-10-18", qty: 75, amount: 3547.50, sales: 5100, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-19", qty: 48, amount: 4940.16, sales: 6900, target: 6500 },
    
    // October 2025 - Week 4
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-10-22", qty: 46, amount: 2957.34, sales: 4140, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-10-23", qty: 82, amount: 3877.40, sales: 5600, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-10-24", qty: 44, amount: 4532.32, sales: 6350, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-25", qty: 62, amount: 3985.98, sales: 5580, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-10-26", qty: 78, amount: 3689.40, sales: 5300, target: 7000 },
    
    // October 2025 - Week 5
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-10-29", qty: 56, amount: 5764.48, sales: 8050, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-10-30", qty: 40, amount: 2571.60, sales: 3600, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-10-31", qty: 88, amount: 4162.40, sales: 6000, target: 7500 },
    
    // November 2025 - Week 1
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-11-01", qty: 50, amount: 5143.00, sales: 7200, target: 7000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-11-02", qty: 54, amount: 3471.66, sales: 4860, target: 5200 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-11-05", qty: 70, amount: 3311.00, sales: 4800, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-11-06", qty: 64, amount: 6590.08, sales: 9200, target: 8500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-11-07", qty: 52, amount: 3343.08, sales: 4680, target: 5000 },
    
    // November 2025 - Week 2
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-11-08", qty: 86, amount: 4070.60, sales: 5800, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-11-09", qty: 41, amount: 4217.26, sales: 5900, target: 5500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-11-12", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-11-13", qty: 72, amount: 3405.60, sales: 4900, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-11-14", qty: 49, amount: 5040.14, sales: 7050, target: 7000 },
    
    // November 2025 - Week 3
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-11-15", qty: 44, amount: 2830.76, sales: 3960, target: 4500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-11-16", qty: 80, amount: 3784.00, sales: 5400, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-11-19", qty: 53, amount: 5453.58, sales: 7600, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-11-20", qty: 56, amount: 3600.24, sales: 5040, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-11-21", qty: 68, amount: 3218.40, sales: 4600, target: 6000 },
    
    // November 2025 - Week 4
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-11-22", qty: 47, amount: 4838.42, sales: 6750, target: 6500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-11-23", qty: 50, amount: 3214.50, sales: 4500, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-11-26", qty: 84, amount: 3973.20, sales: 5700, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-11-27", qty: 46, amount: 4735.56, sales: 6600, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-11-28", qty: 60, amount: 3857.40, sales: 5400, target: 6000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-11-29", qty: 74, amount: 3500.20, sales: 5050, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-11-30", qty: 51, amount: 5247.86, sales: 7350, target: 7500 },
    
    // December 2025 - Week 1
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-12-01", qty: 48, amount: 3085.92, sales: 4320, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-12-02", qty: 82, amount: 3877.40, sales: 5600, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-12-03", qty: 55, amount: 5666.50, sales: 7900, target: 7500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-12-04", qty: 54, amount: 3471.66, sales: 4860, target: 5200 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-12-05", qty: 76, amount: 3599.80, sales: 5200, target: 6500 },
    
    // December 2025 - Week 2
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-12-06", qty: 59, amount: 6073.62, sales: 8500, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-12-07", qty: 52, amount: 3343.08, sales: 4680, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-12-10", qty: 88, amount: 4162.40, sales: 6000, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-12-11", qty: 43, amount: 4426.98, sales: 6200, target: 6000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Purani Hospital Supplies", posting_date: "2025-12-12", qty: 64, amount: 4117.44, sales: 5760, target: 6000 },
    
    // December 2025 - Week 3
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "City Medical Center", posting_date: "2025-12-13", qty: 70, amount: 3311.00, sales: 4800, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Regional Health Services", posting_date: "2025-12-14", qty: 57, amount: 5863.02, sales: 8200, target: 8000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-12-17", qty: 46, amount: 2957.34, sales: 4140, target: 4800 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-12-18", qty: 81, amount: 3829.05, sales: 5500, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "City Medical Center", posting_date: "2025-12-19", qty: 54, amount: 5556.24, sales: 7800, target: 7500 },
    
    // December 2025 - Week 4
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BENISTAR 8", customer_name: "Regional Health Services", posting_date: "2025-12-20", qty: 58, amount: 3728.82, sales: 5220, target: 5500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BRITORVA 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-12-21", qty: 73, amount: 3454.30, sales: 5000, target: 6500 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "ROZULA CV 10", customer_name: "Purani Hospital Supplies", posting_date: "2025-12-24", qty: 50, amount: 5143.00, sales: 7200, target: 7000 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "BENISTAR 8", customer_name: "City Medical Center", posting_date: "2025-12-27", qty: 49, amount: 3150.21, sales: 4410, target: 5000 },
    { sales_team: "Vasco Coimbatore", hq: "HQ-Erode", item_name: "BRITORVA 10", customer_name: "Regional Health Services", posting_date: "2025-12-28", qty: 87, amount: 4115.15, sales: 5900, target: 7500 },
    { sales_team: "CND Trichy", hq: "HQ-Tanjore", item_name: "ROZULA CV 10", customer_name: "Pl.A.Arun Agencies", posting_date: "2025-12-31", qty: 45, amount: 4633.70, sales: 6500, target: 6000 }
];

export default data;
