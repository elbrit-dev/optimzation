# SYSTEM CONSOLE -- each BE seat (Role Profile) gets its Base Area as a Locality (19 Nov 2026).
# Source: "BE Base Area - Genuine Areas.csv" (98 seats) + "BE Base Area - Plain City Names.csv" (128)
#   + "BE Base Area - New Fills (32).csv" and the other 2 Delhi seats (34). Needs the Locality records from
# locality_base_areas_console.py. Prod first. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick "Commit", Execute.
#   Then Clear Cache once (user menu) -- a new field is unknown to GraphQL until then.
# Safe to re-run: only seats whose Locality is empty or different are written.
#
#   1. Custom Field Role Profile.custom_locality -- "Locality", Link -> Locality, after Territory.
#   2. SEATS below: the seat -> the Locality ID of its Base Area (spelling cleaned; Anna Nagar and
#      Kallur resolved by district: "Anna Nagar - Chennai" / "Anna Nagar - Madurai", "Kallur - Thrissur").
#      Written with frappe.db.set_value -- NOT a Role Profile save, which would re-sync the roles of
#      every user on the seat. Seats not in the sheet are left empty.
#   BE1-ELBR-CH-CHE says "AVADI & AMBATTUR"; a Link holds one Locality -> Avadi, the one whose 25 km
#   covers the other and the seat's work (19 Nov 2026): the centres are 5.3 km apart, so each 25 km
#   circle holds the whole other area; Avadi's takes in all 108 doctors Sathya P (E00714) visited since
#   19 Aug (Ambattur's 98), is closer on average (5.3 vs 6.8 km) and 59 of them ARE Avadi doctors.

DRY = True
W = "WOULD " if DRY else ""

SEATS = {
    "BE4-ELBR-RA-JAI":   "Jaipur Old City",        # Anirudha Pathak, Jaipur: Jaipur Old City
    "BE3-ELBR-RA-JAI":   "Vidhyadhar Nagar",       # Neekesh Kumar, Jaipur: Vidadhar Nagar
    "BE2-ELBR-RA-DAU":   "Mansarovar",             # Yogesh Agarwal, Jaipur: Mansovar
    "BE7-ELBR-RA-JOD":   "Paota",                  # Nishant Gehlot, Jodhpur: Paota
    "BE8-ELBR-RA-JOD":   "Shastri Nagar",          # Sandeep Deora, Jodhpur: Sathri Nagar
    "BE4-CND-CH-CHE":    "Adyar",                  # Diwakar R, Chennai: ADAYAR
    "BE6-CND-CH-CHE":    "T. Nagar",               # Prathab A, Chennai: T NAGAR
    "BE9-CND-CH-CHE":    "Perambur",               # Premkumar, Chennai: PERAMBUR
    "BE2-CND-CH-CHE":    "Tambaram",               # Vacant, Chennai: TAMBARAM
    "BE1-CND-CO-COI":    "Gandhipuram",         # Krishnakumar, Coimbatore: udumalaipettai  -> Gandhipuram (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE2-CND-CO-COI":    "Gandhipuram",               # Ranjithkumar Ganesan, Coimbatore: Tirupur  -> Gandhipuram (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE3-CND-CO-COI":    "Gandhipuram",         # Sasikumar, Coimbatore: ooty  -> Gandhipuram (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE4-CND-CO-ERO":    "Erode",      # Naveenkumar Mathiazhagan, Erode: Gobi  -> Erode (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE7-CND-CO-ERO":    "Erode",              # Srimanikandan Sanmugam, Erode: Vellakoil  -> Erode (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE5-CND-CO-SAL":    "Salem",                  # Sakthivel M, Salem: hosur  -> Salem (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE6-CND-CO-SAL":    "Salem",             # Venkatesan Raja, Salem: Gangavalli  -> Salem (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE1-VASC-KA-BAN":   "Vijayanagar",            # Amit Kumar Thakur, Bangalore: VIJAYANAGAR
    "BE4-VASC-KA-BAN":   "R.T. Nagar",             # Atul Yadav, Bangalore: R.T NAGAR
    "BE8-VASC-KA-BAN":   "Koramangala",            # Chandan H G, Bangalore: CORMANGALA
    "BE2-VASC-KA-BAN":   "J.P. Nagar",             # Sachin Yadav, Bangalore: JP NAGAR
    "BE7-VASC-KA-BAN":   "Banashankari",           # Santhosh B K, Bangalore: BANSANKARI
    "BE5-VASC-KA-BAN":   "Indiranagar",            # Vacant, Bangalore: INDRANAGAR
    "BE13-VASC-KA-GOA":  "Margao",                 # Mayur Yuvaraj Mohite, Goa: MARGAO
    "BE13-CND-CH-CHE":   "Mylapore",               # Mohammed Imran M, Chennai: MYLAPORE
    "BE11-CND-CH-CHE":   "Vadapalani",             # Prabhakaran, Chennai: VADAPALANI
    "BE1-CND-CH-CHE":    "Padi",                   # Praveen M, Chennai: PADI
    "BE12-CND-CH-CHE":   "Anna Nagar - Chennai",   # Rangarajan R, Chennai: ANNA NAGAR
    "BE5-CND-CH-CHE":    "GTPT",                   # Sanaullah, Chennai: GTPT
    "BE3-ELBR-CO-COI":   "Gandhipuram",               # Dhaneshkumar Natarajan, Coimbatore: Tirupur  -> Gandhipuram (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE2-ELBR-CO-COI":   "Thudiyalur",             # Giriram R, Coimbatore: Thudiyalur
    "BE1-ELBR-CO-COI":   "Sinniyampalayam",        # Vijadhiran R, Coimbatore: Sinniyampalayam
    "BE4-ELBR-CO-ERO":   "Erode",      # Vignesh Somasundaram, Erode: Gopi  -> Erode (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE5-ELBR-CO-SAL":   "Salem",             # Kamala Kannan, Salem: Dharmapuri  -> Salem (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE7-AURA-KE-COC":   "Ernakulam",      # Ajith Sasidharan, Cochin: Kallur  -> Ernakulam (works there, Sep+Oct check-ins; base_area_change_console.py 19 Nov 2026)
    "BE6-AURA-KE-COC":   "Kacheripady",            # Shifaz P F, Cochin: Kacheripady
    "BE2-ELBR-TR-MAD":   "Palanganatham",          # Ranjit Kumar S, Madurai: Palangantham
    "BE1-ELBR-TR-MAD":   "Iyer Bungalow",          # Sinthankumar Karuppasamy, Madurai: Iyer Bungalow
    "BE5-ELBR-TR-MAD":   "Anna Nagar - Madurai",   # Srinivasan O K, Madurai: Anna Nagar
    "BE5-ELBR-TR-TAN":   "Periya Kovil",           # Azarudeen Samsudeen, Tanjore: Periya Kovil
    "BE6-ELBR-TR-TAN":   "Kumbakonam",             # J Niranjan, Tanjore: Kumbakonam
    "BE4-ELBR-TR-TIR":   "Palayamkottai",          # Mohammed Haniff, Tirunelveli: Palayamkottai
    "BE7-ELBR-TR-TRI":   "Bhima Nagar",            # Mohammed Haroon, Trichy: Bhima Nagar
    "BE8-ELBR-TR-TRI":   "Woraiyur",               # Sabarinath M, Trichy: Woraiyur
    "BE12-ELBR-CH-CHE":  "Vadapalani",             # Damodaram M E, Chennai: VADAPALANI
    "BE11-ELBR-CH-CHE":  "T. Nagar",               # Hasan Basha K, Chennai: T. NAGAR
    "BE5-ELBR-CH-CHE":   "Mylapore",               # Keerthik Raja S, Chennai: MYLAPORE
    "BE1-ELBR-CH-CHE":   "Avadi",                  # Sathya P, Chennai: AVADI & AMBATTUR  (also Ambattur -- one Locality per seat)
    "BE8-ELBR-CH-CHE":   "Adyar",                  # Udhaya Kumar M, Chennai: ADYAR
    "BE3-AURA-CO-COI":   "Gandhipuram",            # Asharudeen, Coimbatore: Gandhipuram
    "BE2-AURA-CO-COI":   "Gandhipuram",            # Bhuvaneshkumar Manikandan, Coimbatore: Gandhipuram
    "BE1-AURA-CO-COI":   "Gandhipuram",            # Vacant, Coimbatore: Gandhipuram
    "BE6-AURA-CO-SAL":   "Namakkal",               # Suresh Chandrasekar, Salem: Namakkal
    "BE6-AURA-KA-BAN":   "Yeshwanthpur",           # Kuruba Parthasarathi, Bangalore: YESWANTHAPUR
    "BE8-AURA-KA-BAN":   "Rajajinagar",            # Sreedhar D S, Bangalore: RAJAJI NAGAR
    "BE2-VASC-CO-COI":   "R.S. Puram",             # Mohammed Hussain A, Coimbatore: R.S.Puram
    "BE1-VASC-CO-COI":   "Gandhipuram",            # Srinivasan Dharuman, Coimbatore: Gandhipuram
    "BE6-VASC-CO-MAD":   "K.K. Nagar",             # Karthick A R, Madurai: K.K.Nagar
    "BE5-VASC-CO-MAD":   "Anna Nagar - Madurai",   # Seenivasan T B, Madurai: Anna Nagar
    "BE4-VASC-CO-SAL":   "Seelanayakkanpatti",     # Mano Solaiyappan, Salem: Seelanayakkanpatti bypass
    "BE12-VASC-CO-SAL":  "Fourhouse",              # Selvamani Ramasamy, Salem: Fourhouse
    "BE7-ELBR-TE-HYD":   "Kukatpally",             # Anjanikumar Yenisetti, Hyderabad: KUKATPALLY
    "BE2-ELBR-TE-HYD":   "Centre City",            # Gandamalla Vinith, Hyderabad: centre city
    "BE4-ELBR-TE-HYD":   "Secunderabad",           # Koduri Vishnu Vardhan, Hyderabad: Secunderabad
    "BE9-ELBR-TE-HYD":   "Ameerpet",               # Kukatla Rakesh, Hyderabad: AMEERPET
    "BE11-ELBR-TE-HYD":  "Dilsukhnagar",           # Methku Raghavendra Reddy, Hyderabad: DILSUKHNAGAR
    "BE8-ELBR-TE-HYD":   "HITEC City",             # Sangeeta Virbhadra Dumane, Hyderabad: HITECH CITY
    "BE10-ELBR-TE-HYD":  "Old City",               # Srikanth V, Hyderabad: OLDCITY
    "BE1-ELBR-TE-HYD":   "Hayathnagar",            # Vacant, Hyderabad: Hayatnagar
    "BE9-CND-TR-MAD":    "Dindigul",               # Balasubramani V, Madurai: DINDIGUL
    "BE6-CND-TR-TAN":    "Kumbakonam",             # Vacant, Tanjore: KUMBAKONAM
    "BE9-AURA-CH-CHE":   "Ambattur",               # Aravind Kumar G, Chennai: Ambattur
    "BE2-AURA-CH-CHE":   "Vadapalani",             # Lokesh S, Chennai: Vadapalani
    "BE11-AURA-CH-CHE":  "Tambaram",               # Lokesh Santhanam, Chennai: Tambaram
    "BE13-AURA-CH-CHE":  "GTPT",                   # Mohammed Vajhudeen S, Chennai: GTPT
    "BE4-AURA-CH-CHE":   "Perambur",               # R K Yuvaraj, Chennai: Perambur
    "BE1-AURA-CH-CHE":   "T. Nagar",               # Vijaybabu K, Chennai: T.Nagar
    "BE15-ELBR-BA-BAN":  "R.R. Nagar",             # Adarsh Kumar, Bangalore: R R NAGAR
    "BE6-ELBR-BA-BAN":   "Vijayanagar",            # Akhilesh Pal, Bangalore: VIJAYNAGAR
    "BE9-ELBR-BA-BAN":   "Indiranagar",            # Anish Yadav, Bangalore: INDIRANAGAR
    "BE2-ELBR-BA-BAN":   "Shivajinagar",           # Ganesh Umar Vaishya, Bangalore: SHIVAJINAGAR
    "BE1-ELBR-BA-BAN":   "Koramangala",            # Krishna Kumar Gaud, Bangalore: KORAMANGALA
    "BE8-ELBR-BA-BAN":   "Jayadeva",               # Manish Kumar Yadav, Bangalore: JAYADEVA
    "BE16-ELBR-BA-BAN":  "Whitefield",             # Pawan Maurya, Bangalore: WHITEFIELD
    "BE3-ELBR-BA-BAN":   "R.T. Nagar",             # Sandeep Kumar Gautam, Bangalore: R T NAGAR
    "BE7-ELBR-BA-BAN":   "Jayanagar",              # Sandeep Kumar Yadav, Bangalore: JAYANAGAR
    "BE4-ELBR-BA-BAN":   "Banashankari",           # Varun R, Bangalore: BANASANKARI
    "BE5-ELBR-BA-BAN":   "Rajajinagar",            # Vinay Kumar, Bangalore: RAJAJINAGAR
    "BE14-ELBR-BA-BAN":  "Malleswaram",            # Yadav Saurbh Shitlaprasad, Bangalore: MALLESWARAM
    "BE4-ELBR-MY-GOA":   "Panaji",                 # Nawaz Nizam Nachare, Goa: PANJIM
    "BE10-ELBR-MY-GOA":  "Margao",                 # Sarfaraj Gulab Patankar, Goa: Madgao
    "BE11-ELBR-MY-MAN":  "Udupi",                  # Nishanth S Kumar, Mangalore: UDUPI
    "BE9-ELBR-MY-MYS":   "Mysore Jayadeva",        # Vijayakumar M, Mysore: Mysore Jayadeva
    "BE10-VASC-CH-CHE":  "Vadapalani",             # Abirahul, Chennai: VADAPALANI
    "BE3-VASC-CH-CHE":   "Anna Nagar - Chennai",   # Hari Babu, Chennai: ANNA NAGAR
    "BE9-VASC-CH-CHE":   "Tambaram",               # Lakshmanan V, Chennai: THAMBARAM
    "BE2-VASC-CH-CHE":   "Perambur",               # Nandha Kumar C, Chennai: PERAMBUR
    "BE8-VASC-CH-CHE":   "Mylapore",               # Ponnsethupathi S T, Chennai: MYLAPORE
    "BE1-VASC-CH-CHE":   "GTPT",                   # Sathish C, Chennai: GTPT
    # --- "BE Base Area - Plain City Names.csv" (128 seats): the base area is the HQ town itself; every one
    #     is already a Locality (a doctor Map Town), under its current name -- sheet spelling after the #.
    "BE6-ELBR-RA-AJM":   "Ajmer",               # Ajemr  (Ajmer)
    "BE1-ELBR-RA-ALW":   "Alwar",               # Alwar
    "BE9-ELBR-RA-BAR":   "Baran",               # Baran
    "BE10-ELBR-RA-BHA":  "Bharatpur",           # Bharatpur
    "BE11-ELBR-RA-BHI":  "Bhilwara",            # Bhilwara
    "BE12-ELBR-RA-KOT":  "Kota",                # Kota
    "BE5-ELBR-RA-SIK":   "Sikar",               # Siker  (Sikar)
    "BE13-ELBR-RA-UDA":  "Udaipur",             # Udaipur
    "BE8-ELBR-PR-ALL":   "Prayagraj",           # Allahabad  (Prayagraj)
    "BE14-ELBR-PR-AYO":  "Ayodhya",             # Ayodhya
    "BE9-ELBR-PR-AZA":   "Azamgarh",            # Azamgarh
    "BE13-ELBR-PR-BAL":  "Ballia",              # ballia
    "BE3-ELBR-PR-GOR":   "Gorakhpur",           # Gorakhpur
    "BE2-ELBR-PR-GOR":   "Gorakhpur",           # Gorakhpur
    "BE5-ELBR-PR-KAN":   "Kanpur",              # Kanpur
    "BE4-ELBR-PR-KAN":   "Kanpur",              # Kanpur
    "BE12-ELBR-PR-LUC":  "Lucknow",             # Lucknow
    "BE6-ELBR-PR-LUC":   "Lucknow",             # Lucknow
    "BE10-ELBR-PR-VAR":  "Varanasi",            # Varanasi
    "BE11-ELBR-PR-VAR":  "Varanasi",            # Varanasi
    "BE7-CND-CH-CUD":    "Cuddalore",           # CUDDALORE
    "BE3-CND-CH-KAN":    "Kancheepuram",        # KANCHEEPURAM
    "BE10-VASC-KA-BEL":  "Belagavi",            # BELGAUM  (Belagavi)
    "BE6-VASC-KA-BEL":   "Ballari",             # BELLARY  (Ballari)
    "BE9-VASC-KA-BIJ":   "Vijayapura",          # BIJAPUR  (Vijayapura)
    "BE11-VASC-KA-DAV":  "Davanagere",          # DAVANAGERE
    "BE3-VASC-KA-GUL":   "Kalaburagi",          # GULBARGA  (Kalaburagi)
    "BE12-VASC-KA-HUB":  "Hubballi",            # HUBBALI  (Dharwad)
    "BE14-VASC-KA-MAN":  "Mangaluru",           # MANGALORE  (Dakshina Kannada)
    "BE14-CND-CH-PON":   "Puducherry",          # PONDICHERRY  (Puducherry)
    "BE10-CND-CH-VEL":   "Vellore",             # VELLORE
    "BE7-ELBR-CO-ERO":   "Erode",               # Erode
    "BE6-ELBR-CO-SAL":   "Salem",               # Salem
    "BE10-AURA-CH-CHE":  "Chennai",             # Chennai
    "BE3-AURA-CH-PON":   "Puducherry",          # Pondicherry  (Puducherry)
    "BE14-AURA-KA-BEL":  "Belagavi",            # Belgaum  (Belagavi)
    "BE15-AURA-KA-DAV":  "Davanagere",          # Davanagere
    "BE18-AURA-KA-HUB":  "Hubballi",            # Hubbali  (Dharwad)
    "BE7-AURA-KA-MAN":   "Mangaluru",           # Mangalore  (Dakshina Kannada)
    "BE10-AURA-KA-SHI":  "Shivamogga",          # Shimoga  (Shivamogga)
    "BE2-ELBR-DE-GHA":   "Ghaziabad",           # Ghaziabad
    "BE4-ELBR-DE-GUR":   "Gurugram",            # Gurgaon  (Gurugram)
    "BE8-ELBR-DE-NOI":   "Noida",               # Noida
    "BE5-AURA-KE-ALL":   "Alappuzha",           # Alleppey  (Alappuzha)
    "BE1-AURA-KE-CAL":   "Kozhikode",           # Calicut  (Kozhikode)
    "BE2-AURA-KE-KAN":   "Kannur",              # Kannur
    "BE8-AURA-KE-KOL":   "Kollam",              # Kollam
    "BE12-AURA-KTY":     "Kottayam",            # Kottayam
    "BE3-AURA-KE-PAL":   "Palakkad",            # Palakkad
    "BE4-AURA-KE-PER":   "Perinthalmanna",      # Perintalmanna  (Malappuram)
    "BE11-AURA-KE-THI":  "Thiruvalla",          # Thiruvalla
    "BE9-AURA-KE-THR":   "Thrissur",            # Thrissur
    "BE10-AURA-KE-TRI":  "Thiruvananthapuram",  # Trivandrum  (Thiruvananthapuram)
    "BE1-ELBR-AP-ANA":   "Anantapur",           # Anantapur
    "BE4-ELBR-AP-GUN":   "Guntur",              # Guntur
    "BE2-ELBR-AP-KAD":   "Kadapa",              # Kadapa
    "BE3-ELBR-AP-KUR":   "Kurnool",             # Kurnool
    "BE5-ELBR-AP-NEL":   "Nellore",             # Nellore
    "BE3-ELBR-TR-NAG":   "Nagercoil",           # Nagercoil
    "BE10-ELBR-CH-CUD":  "Cuddalore",           # CUDDALORE
    "BE13-ELBR-CH-KAN":  "Kancheepuram",        # KANCHIPURAM  (Kancheepuram)
    "BE3-ELBR-CH-PON":   "Puducherry",          # PONDICHERRY  (Puducherry)
    "BE6-ELBR-CH-VEL":   "Vellore",             # VELLORE
    "BE5-AURA-CO-DHA":   "Dharmapuri",          # Dharmapuri
    "BE4-AURA-CO-ERO":   "Erode",               # Erode
    "BE7-AURA-CO-SAL":   "Salem",               # salem
    "BE11-AURA-KA-BEL":  "Ballari",             # Bellary  (Ballari)
    "BE12-AURA-KA-BIJ":  "Vijayapura",          # Bijapur  (Vijayapura)
    "BE13-AURA-KA-GUL":  "Kalaburagi",          # Gulbarga  (Kalaburagi)
    "BE3-VASC-CO-ERO":   "Erode",               # Erode
    "BE9-VASC-CO-KUM":   "Kumbakonam",          # Kumbakonam
    "BE7-VASC-CO-NAG":   "Nagercoil",           # Nagercoil
    "BE10-VASC-CO-TAN":  "Thanjavur",           # Tanjore  (Thanjavur)
    "BE8-VASC-CO-TIR":   "Tirunelveli",         # Tirunelveli
    "BE11-VASC-CO-TRI":  "Tiruchirappalli",     # Trichy  (Tiruchirappalli)
    "BE5-ELBR-TE-KAR":   "Karimnagar",          # KARIMNAGAR
    "BE6-ELBR-TE-NIZ":   "Nizamabad",           # Nizamabad
    "BE3-ELBR-TE-WAR":   "Warangal",            # WARANGAL
    "BE13-AURA-RA-AJM":  "Ajmer",               # Ajmer
    "BE16-ELBR-PR-ALI":  "Aligarh",             # Aligharh  (Aligarh)
    "BE9-AURA-RA-ALW":   "Alwar",               # Alwar
    "BE1-AURA-RA-BHA":   "Bharatpur",           # Bharathpur  (Bharatpur)
    "BE11-AURA-RA-BHI":  "Bhilwara",            # Bhilwara
    "BE15-ELBR-PR-JHA":  "Jhansi",              # Jhansi
    "BE5-AURA-RA-KOT":   "Kota",                # Kota
    "BE8-AURA-RA-SIK":   "Sikar",               # Sikar
    "BE12-AURA-RA-UDA":  "Udaipur",             # Udaipur
    "BE1-CND-TR-MAD":    "Madurai",             # MADURAI
    "BE2-CND-TR-MAD":    "Madurai",             # MADURAI
    "BE3-CND-TR-NAG":    "Nagercoil",           # NAGERCOIL
    "BE5-CND-TR-TAN":    "Thanjavur",           # THANJAVUR
    "BE4-CND-TR-TIR":    "Tirunelveli",         # TIRUNELVELI
    "BE8-CND-TR-TRI":    "Tiruchirappalli",     # TRICHY  (Tiruchirappalli)
    "BE7-CND-TR-TRI":    "Tiruchirappalli",     # TRICHY  (Tiruchirappalli)
    "BE7-AURA-CH-CUD":   "Cuddalore",           # Cuddalore
    "BE8-AURA-CH-KAN":   "Kancheepuram",        # Kanchipuram  (Kancheepuram)
    "BE12-AURA-CH-VEL":  "Vellore",             # Vellore
    "BE4-ELBR-KE-ALL":   "Alappuzha",           # Alleppey  (Alappuzha)
    "BE1-ELBR-KE-CAL":   "Kozhikode",           # Calicut  (Kozhikode)
    "BE5-ELBR-KE-ERN":   "Kochi",               # Cochin  (Ernakulam)
    "BE6-ELBR-KE-ERN":   "Kochi",               # Cochin  (Ernakulam)
    "BE2-ELBR-KE-KAN":   "Kannur",              # Kannur
    "BE11-ELBR-KE-KOL":  "Kollam",              # Kollam
    "BE7-ELBR-KE-KOT":   "Kottayam",            # Kottayam
    "BE8-ELBR-KE-PAL":   "Palakkad",            # Palakkad
    "BE3-ELBR-KE-PER":   "Perinthalmanna",      # Perintalmanna  (Malappuram)
    "BE12-ELBR-KE-THI":  "Thiruvalla",          # Thiruvalla
    "BE10-ELBR-KE-THR":  "Thrissur",            # Thrissur
    "BE9-ELBR-KE-THR":   "Thrissur",            # Thrissur
    "BE14-ELBR-KE-TRI":  "Thiruvananthapuram",  # Trivandrum  (Thiruvananthapuram)
    "BE13-ELBR-KE-TRI":  "Thiruvananthapuram",  # Trivandrum  (Thiruvananthapuram)
    "BE6-ELBR-MY-BEL":   "Belagavi",            # BELGAUM  (Belagavi)
    "BE10-ELBR-BA-BEL":  "Ballari",             # BELLARY  (Ballari)
    "BE11-ELBR-BA-BIJ":  "Vijayapura",          # BIJAPUR  (Vijayapura)
    "BE1-ELBR-MY-DAV":   "Davanagere",          # DAVANAGERE
    "BE12-ELBR-BA-GUL":  "Kalaburagi",          # GULBARGA  (Kalaburagi)
    "BE2-ELBR-MY-HUB":   "Hubballi",            # HUBBALI  (Dharwad)
    "BE5-ELBR-MY-MAN":   "Mangaluru",           # MANGALORE  (Dakshina Kannada)
    "BE7-ELBR-MY-MYS":   "Mysuru",              # MYSORE  (Mysuru)
    "BE3-ELBR-MY-SHI":   "Shivamogga",          # SHIMOGA  (Shivamogga)
    "BE13-ELBR-BA-TUM":  "Tumakuru",            # TUMKUR  (Tumakuru)
    "BE6-VASC-CH-CUD":   "Cuddalore",           # Cuddalore
    "BE7-VASC-CH-PON":   "Puducherry",          # Pondicherry  (Puducherry)
    "BE4-VASC-CH-VEL":   "Vellore",             # Vellore
    "BE5-AURA-MA-KUM":   "Kumbakonam",          # Kumbakonam
    "BE3-AURA-MA-NAG":   "Nagercoil",           # Nagercoil
    "BE6-AURA-MA-TAN":   "Thanjavur",           # Tanjore  (Thanjavur)
    "BE4-AURA-MA-TIR":   "Tirunelveli",         # Tirunelveli
    # --- "BE Base Area - New Fills (32).csv" + the 2 other Delhi seats (34). Delhi is ONE base area, not
    #     Central / East / North / South / West: every Delhi seat -> "New Delhi", the one Delhi Locality
    #     (all 718 Delhi doctors carry Map Town New Delhi). Vizag East / South -> Visakhapatnam, same reason.
    "BE1-ELBR-PR-DEO":   "Gorakhpur",           # Deoria HQ: Gorakhpur
    "BE6-AURA-CH-CHE":   "Velachery",           # Chennai: Velachery
    "BE5-AURA-CH-CHE":   "Mylapore",            # Chennai: Mylapore
    "BE20-AURA-KA-MYS":  "Mysuru",              # MYSORE
    "BE3-AURA-KA-MYS":   "Mysuru",              # MYSORE
    "BE1-ELBR-DE-CEN":   "New Delhi",           # Central -> Delhi as one
    "BE12-ELBR-DE-CEN":  "New Delhi",           # Central -> Delhi as one
    "BE10-ELBR-DE-EAS":  "New Delhi",           # East -> Delhi as one
    "BE7-ELBR-DE-EAS":   "New Delhi",           # East -> Delhi as one
    "BE9-ELBR-DE- NO":   "New Delhi",           # North -> Delhi as one (the seat ID has the space)
    "BE5-ELBR-DE- NO":   "New Delhi",           # North -> Delhi as one (the seat ID has the space)
    "BE11-ELBR-DE-SOU":  "New Delhi",           # South -> Delhi as one
    "BE3-ELBR-DE-SOU":   "New Delhi",           # not in the sheet: South Delhi seat -> Delhi as one
    "BE6-ELBR-DE-WES":   "New Delhi",           # not in the sheet: West Delhi seat -> Delhi as one
    "BE10-ELBR-AP-KAK":  "Kakinada",            # Kakinada
    "BE8-ELBR-AP-RAJ":   "Rajahmundry",         # Rajamundry
    "BE9-ELBR-AP-TIR":   "Tirupati",            # Tirupati
    "BE11-ELBR-AP-VIZ":  "Visakhapatnam",       # Vizag - EAST -> Vizag as one
    "BE12-ELBR-AP-VIZ":  "Visakhapatnam",       # Vizag - SOUTH -> Vizag as one
    "BE9-AURA-KA-BAN":   "Jayanagar",           # JAYANAGAR
    "BE4-AURA-KA-BAN":   "R.T. Nagar",          # R.T NAGAR
    "BE19-AURA-KA-BAN":  "Banashankari",        # BANASANKARI
    "BE5-AURA-KA-BAN":   "Yelahanka",           # YALAHANKA
    "BE2-AURA-KA-BAN":   "Vijayanagar",         # VIJAYANAGAR (the Bengaluru one)
    "BE13-ELBR-PR-AGR":  "Agra",                # Agra
    "BE14-ELBR-PR-AGR":  "Agra",                # Agra
    "BE3-AURA-RA-JAI":   "Jaipur",              # Jaipur
    "BE2-AURA-RA-JAI":   "Jaipur",              # Jaipur
    "BE6-AURA-RA-JOD":   "Jodhpur",             # Jodhpur
    "BE4-AURA-RA-JOD":   "Jodhpur",             # Jodhpur
    "BE1-AURA-MA-MAD":   "Madurai",             # Madurai
    "BE2-AURA-MA-MAD":   "Madurai",             # Madurai
    "BE8-AURA-MA-TRI":   "Tiruchirappalli",     # Trichy
    "BE7-AURA-MA-TRI":   "Tiruchirappalli",     # Trichy
    # --- the user, 19 Nov 2026: direction seats + vacant seats on their HQ town (12). A city is split only
    #     when it is really big: Mysuru / Vijayawada one area each; Goa North / South two (two districts).
    "BE8-CND-CH-CHE":    "Tiruvottiyur",        # North Chennai: Lohith Murugan's 92 doctors since 19 Aug -- its 25 km takes all 92, avg 5.6 km
    "BE15-VASC-KA-MYS":  "Mysuru",              # Mysore South -> Mysuru as one (his doctors are in Mysuru city)
    "BE16-VASC-KA-MYS":  "Mysuru",              # Mysore North -> Mysuru as one
    "BE16-AURA-KA-GOA":  "Panaji",              # North Goa (Panaji 22, Mapusa 22, Bicholim 11 doctors)
    "BE17-AURA-KA-GOA":  "Margao",              # South Goa (vacant) -- Goa's two districts stay two areas
    "BE6-ELBR-AP-VIJ":   "Vijayawada",          # Vijayawada South -> Vijayawada as one (94 of 127 doctors in it)
    "BE7-ELBR-AP-VIJ":   "Vijayawada",          # Vijayawada West -> Vijayawada as one (90 of 142)
    "BE14-ELBR-RA-KOT":  "Kota",                # vacant -> HQ town
    "BE10-AURA-RA-BAR":  "Baran",               # vacant -> HQ town
    "BE7-AURA-RA-DAU":   "Dausa",               # vacant -> HQ town
    "BE15-CND-CH-CUD":   "Cuddalore",           # vacant -> HQ town
    "BE8-ELBR-MY-MYS":   "Mysuru",              # vacant -> HQ town
    # Skipped on purpose (the user): Punjab / Himachal -- BE1-ELBR-PU-MAN, BE2-ELBR-PU-PAN, BE3-ELBR-PU-UNA.
}

# 1. the field
if frappe.db.exists("Custom Field", {"dt": "Role Profile", "fieldname": "custom_locality"}):
    print("ok: Role Profile.custom_locality exists")
    has = True
else:
    print(W + "add field Role Profile.custom_locality (Link -> Locality, after custom_territory)")
    has = False
    if not DRY:
        frappe.get_doc({"doctype": "Custom Field", "dt": "Role Profile", "fieldname": "custom_locality", "label": "Locality",
                        "fieldtype": "Link", "options": "Locality", "insert_after": "custom_territory",
                        "in_standard_filter": 1, "description": "The seat's base area"}).insert(ignore_permissions=True)
        has = True

# 2. the seats
missing_seat = []
missing_loc = []
same = 0
todo = []
for seat in SEATS:
    loc = SEATS[seat]
    if not frappe.db.exists("Role Profile", seat):
        missing_seat.append(seat)
        continue
    if not frappe.db.exists("Locality", loc):
        missing_loc.append(seat + " -> " + loc)
        continue
    cur = frappe.db.get_value("Role Profile", seat, "custom_locality") if has else None
    if cur == loc:
        same = same + 1
    else:
        todo.append([seat, loc, cur])
print(str(len(SEATS)) + " seats | already right: " + str(same) + " | " + W + "set: " + str(len(todo)))
if missing_seat:
    print("NOT FOUND (seat): " + ", ".join(missing_seat))
if missing_loc:
    print("NOT FOUND (Locality -- run locality_base_areas_console.py first): " + ", ".join(missing_loc))
for x in todo[:12]:
    print("   " + x[0] + " -> " + x[1] + ((" (was " + str(x[2]) + ")") if x[2] else ""))
if len(todo) > 12:
    print("   ...")
if not DRY:
    for x in todo:
        frappe.db.set_value("Role Profile", x[0], "custom_locality", x[1], update_modified=False)
    print("done -- " + str(len(todo)) + " seats set. Press Clear Cache once.")
else:
    print("dry run -- nothing changed.")
