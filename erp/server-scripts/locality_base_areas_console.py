# SYSTEM CONSOLE -- Locality gets a City (the district), and the BEs' Base Areas are added (19 Nov 2026).
# Prod first (UAT after locality_console.py there). Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run: adds what is missing, fills City only where it is empty.
#
#   1. DocType Locality: new field "city" (City -- the district), shown in the list and as a filter.
#      locality_name is no longer unique: the same area name can be in two districts.
#      The record ID stays the name ("Chennai") -- doctors link to it -- and only when that name is
#      already used for another district does the ID get the district added: "Kallur - Thrissur".
#   2. City for the 751 Map Town localities: the Mapbox district at the median point of that
#      town's doctors (same Mapbox as the Map Town Fill script).
#   3. The Base Areas ("BE Base Area - Genuine Areas.csv", 98 rows): spellings cleaned to one name each
#      (below); district from Mapbox near the HQ town; an area Mapbox does not know is a neighbourhood
#      of its HQ city -> that city's district. Areas that ARE a Map Town are not added again (the
#      town's record is used). Same name, other district: Anna Nagar (Chennai and Madurai), Kallur
#      (Thrissur, Kerala -- the Map Town Kallur is in Kurnool).
#     Sheet spelling                  -> Locality name
#     Jaipur Old City              -> Jaipur Old City
#     Vidadhar Nagar               -> Vidhyadhar Nagar
#     Mansovar                     -> Mansarovar
#     Paota                        -> Paota
#     Sathri Nagar                 -> Shastri Nagar
#     ADAYAR                       -> Adyar
#     ADYAR                        -> Adyar
#     T NAGAR                      -> T. Nagar
#     T. NAGAR                     -> T. Nagar
#     T.Nagar                      -> T. Nagar
#     PERAMBUR                     -> Perambur
#     Perambur                     -> Perambur
#     TAMBARAM                     -> Tambaram
#     THAMBARAM                    -> Tambaram
#     Tambaram                     -> Tambaram
#     MYLAPORE                     -> Mylapore
#     VADAPALANI                   -> Vadapalani
#     Vadapalani                   -> Vadapalani
#     PADI                         -> Padi
#     ANNA NAGAR                   -> Anna Nagar
#     Anna Nagar                   -> Anna Nagar
#     GTPT                         -> GTPT
#     AVADI & AMBATTUR             -> Avadi + Ambattur
#     Ambattur                     -> Ambattur
#     udumalaipettai               -> Udumalaipettai
#     Tirupur                      -> Tiruppur
#     ooty                         -> Udhagamandalam
#     Gobi                         -> Gobichettipalayam
#     Gopi                         -> Gobichettipalayam
#     Vellakoil                    -> Vellakoil
#     hosur                        -> Hosur
#     Gangavalli                   -> Gangavalli
#     Thudiyalur                   -> Thudiyalur
#     Sinniyampalayam              -> Sinniyampalayam
#     Dharmapuri                   -> Dharmapuri
#     Gandhipuram                  -> Gandhipuram
#     Namakkal                     -> Namakkal
#     R.S.Puram                    -> R.S. Puram
#     VIJAYANAGAR                  -> Vijayanagar
#     VIJAYNAGAR                   -> Vijayanagar
#     R.T NAGAR                    -> R.T. Nagar
#     R T NAGAR                    -> R.T. Nagar
#     CORMANGALA                   -> Koramangala
#     KORAMANGALA                  -> Koramangala
#     JP NAGAR                     -> J.P. Nagar
#     BANSANKARI                   -> Banashankari
#     BANASANKARI                  -> Banashankari
#     INDRANAGAR                   -> Indiranagar
#     INDIRANAGAR                  -> Indiranagar
#     YESWANTHAPUR                 -> Yeshwanthpur
#     RAJAJI NAGAR                 -> Rajajinagar
#     RAJAJINAGAR                  -> Rajajinagar
#     R R NAGAR                    -> R.R. Nagar
#     SHIVAJINAGAR                 -> Shivajinagar
#     JAYADEVA                     -> Jayadeva
#     WHITEFIELD                   -> Whitefield
#     JAYANAGAR                    -> Jayanagar
#     MALLESWARAM                  -> Malleswaram
#     Mysore Jayadeva              -> Mysore Jayadeva
#     MARGAO                       -> Margao
#     Madgao                       -> Margao
#     PANJIM                       -> Panaji
#     UDUPI                        -> Udupi
#     Kallur                       -> Kallur
#     Kacheripady                  -> Kacheripady
#     Palangantham                 -> Palanganatham
#     Iyer Bungalow                -> Iyer Bungalow
#     K.K.Nagar                    -> K.K. Nagar
#     DINDIGUL                     -> Dindigul
#     Periya Kovil                 -> Periya Kovil
#     Kumbakonam                   -> Kumbakonam
#     KUMBAKONAM                   -> Kumbakonam
#     Palayamkottai                -> Palayamkottai
#     Bhima Nagar                  -> Bhima Nagar
#     Woraiyur                     -> Woraiyur
#     Seelanayakkanpatti bypass    -> Seelanayakkanpatti
#     Fourhouse                    -> Fourhouse
#     KUKATPALLY                   -> Kukatpally
#     centre city                  -> Centre City
#     Secunderabad                 -> Secunderabad
#     AMEERPET                     -> Ameerpet
#     DILSUKHNAGAR                 -> Dilsukhnagar
#     HITECH CITY                  -> HITEC City
#     OLDCITY                      -> Old City
#     Hayatnagar                   -> Hayathnagar

DRY = True
W = "WOULD " if DRY else ""

TOWN_CITY = {
    "Aandhi": "Jaipur Rural",
    "Adilabad": "Adilabad",
    "Adoni": "Kurnool",
    "Adoor": "Pathanamthitta",
    "Agiripalle": "Eluru",
    "Agra": "Agra",
    "Ahore": "Jalore",
    "Ajjampura": "Chikkamagaluru",
    "Ajmer": "Ajmer",
    "Akbarpur": "Ambedkar Nagar",
    "Aklera": "Jhalawar",
    "Alangulam": "Tenkasi",
    "Alappuzha": "Alappuzha",
    "Alathur": "Palakkad",
    "Aligarh": "Aligarh",
    "Aluva": "Ernakulam",
    "Alwar": "Alwar",
    "Amalapuram": "Dr BR Ambedkar Konaseema",
    "Amb": "Una",
    "Ambalappuzha": "Alappuzha",
    "Ambasamudram": "Tirunelveli",
    "Ambur": "Tirupathur",
    "Amethi": "Amethi",
    "Anaicut": "Vellore",
    "Anakapalle": "Anakapalli",
    "Anantapur": "Ananthapuramu",
    "Andipatti": "Theni",
    "Anekal": "Bengaluru Urban",
    "Antah": "Baran",
    "Anthiyur": "Erode",
    "Arakonam": "Ranipet",
    "Arani": "Tiruvannamalai",
    "Aranthangi": "Pudukkottai",
    "Arcot": "Ranipet",
    "Ariyalur": "Ariyalur",
    "Armoor": "Nizamabad",
    "Arrekode": "Malappuram",
    "Aruppukkottai": "Virudhunagar",
    "Asind": "Bhilwara",
    "Athani": "Belagavi",
    "Atmakur": "Nandyal",
    "Atru": "Baran",
    "Attingal": "Thiruvananthapuram",
    "Attur": "Salem",
    "Auraiya": "Auraiya",
    "Auroville": "Viluppuram",
    "Avadi": "Thiruvallur",
    "Avinashi": "Tiruppur",
    "Ayodhya": "Ayodhya",
    "Azamgarh": "Azamgarh",
    "Badgaon": "Udaipur",
    "Badshahpur": "Gurugram",
    "Bagalkot": "Bagalkote",
    "Bagepalli": "Chikkaballapura",
    "Bahour": "Puducherry",
    "Bairia": "Ballia",
    "Bakshi Ka Talab": "Lucknow",
    "Baldwara": "Mandi",
    "Balh": "Mandi",
    "Ballari": "Ballari",
    "Ballia": "Ballia",
    "Banda": "Banda",
    "Bandikui": "Dausa",
    "Bangana": "Una",
    "Bangarapet": "Kolar",
    "Bansdih": "Ballia",
    "Bansgaon": "Gorakhpur",
    "Bantval": "Dakshina Kannada",
    "Bara": "Prayagraj",
    "Barabanki": "Barabanki",
    "Baran": "Baran",
    "Barmer": "Barmer",
    "Barsar": "Hamirpur",
    "Basavakalyan": "Bidar",
    "Bassi": "Jaipur Rural",
    "Basti": "Basti",
    "Baswa": "Dausa",
    "Bayana": "Bharatpur",
    "Beawar": "Beawar",
    "Behror": "Kotputli-Behror",
    "Belagavi": "Belagavi",
    "Beltangadi": "Dakshina Kannada",
    "Belthara Road": "Ballia",
    "Bengaluru": "Bengaluru Urban",
    "Bhadohi": "Bhadohi",
    "Bhadrajun": "Jalore",
    "Bhadravati": "Shivamogga",
    "Bharatpur": "Bharatpur",
    "Bhavani": "Erode",
    "Bhilwara": "Bhilwara",
    "Bhinmal": "Jalore",
    "Bhuntar": "Kullu",
    "Bhuvanagiri": "Cuddalore",
    "Bicholim": "North Goa",
    "Bidar": "Bidar",
    "Bijoliya": "Bhilwara",
    "Bilara": "Jodhpur Rural",
    "Bilaspur": "Bilaspur",
    "Bodhan": "Nizamabad",
    "Bodinayakanur": "Theni",
    "Brahmavara": "Udupi",
    "Buchireddipalem": "SPSR Nellore",
    "Budalur": "Thanjavur",
    "Bukkaraya Samudram": "Ananthapuramu",
    "Bulandshahr": "Bulandshahr",
    "Bundi": "Bundi",
    "Burhanpur": "Azamgarh",
    "Chaksu": "Jaipur Rural",
    "Chalakkudy": "Thrissur",
    "Challakere": "Chitradurga",
    "Chamarajanagar": "Chamarajanagara",
    "Chandigarh": "Chandigarh",
    "Changanassery": "Kottayam",
    "Channagiri": "Davanagere",
    "Channapatna": "Ramanagara",
    "Channarayapatna": "Hassan",
    "Chengalpattu": "Chengalpattu",
    "Chengannur": "Alappuzha",
    "Chennai": "Chennai",
    "Cheranmahadevi": "Tirunelveli",
    "Cherthala": "Alappuzha",
    "Cheyyar": "Tiruvannamalai",
    "Cheyyur": "Chengalpattu",
    "Chhabra": "Baran",
    "Chhipabarod": "Baran",
    "Chhoti Sadri": "Pratapgarh",
    "Chidambaram": "Cuddalore",
    "Chikkaballapura": "Chikkaballapura",
    "Chikkamagaluru": "Chikkamagaluru",
    "Chikkodi": "Belagavi",
    "Chilakaluripet": "Palnadu",
    "Chinnasalem": "Kallakurichi",
    "Chintamani": "Chikkaballapura",
    "Chitradurga": "Chitradurga",
    "Chittaurgarh": "Chittorgarh",
    "Chittoor": "Chittoor",
    "Chittur": "Palakkad",
    "Chomu": "Jaipur Rural",
    "Churu": "Churu",
    "Coimbatore": "Coimbatore",
    "Coonoor": "The Nilgiris",
    "Cuddalore": "Cuddalore",
    "Dadasiba": "Kangra",
    "Dadri": "Gautam Buddha Nagar",
    "Danta Ramgarh": "Sikar",
    "Dausa": "Dausa",
    "Davanagere": "Davanagere",
    "Deeg": "Deeg",
    "Delwara": "Rajsamand",
    "Deoria": "Deoria",
    "Dera Gopipur": "Kangra",
    "Devakottai": "Sivaganga",
    "Devanahalli": "Bengaluru Rural",
    "Dharapuram": "Tiruppur",
    "Dharmapuri": "Dharmapuri",
    "Dharmavaram": "Sri Sathya Sai",
    "Dharwad": "Dharwad",
    "Dhaulpur": "Dholpur",
    "Digod": "Kota",
    "Dindigul": "Dindigul",
    "Dodda Ballapur": "Bengaluru Rural",
    "Dwarka": "South West Delhi",
    "Edappadi": "Salem",
    "Elkathurthy": "Hanumakonda",
    "Eluru": "Eluru",
    "Eral": "Thoothukudi",
    "Ernakulam": "Ernakulam",
    "Erode": "Erode",
    "Erumely": "Kottayam",
    "Etawah": "Etawah",
    "Etmadpur": "Agra",
    "Faizabad": "Ayodhya",
    "Faridabad": "Faridabad",
    "Farooqnagar": "Ranga Reddy",
    "Farrukhabad": "Farrukhabad",
    "Fatehgarh Sahib": "Fatehgarh Sahib",
    "Fatehpur": "Sikar",
    "Firozabad": "Firozabad",
    "Gadag": "Gadag",
    "Gagret": "Una",
    "Gandarvakkottai": "Pudukkottai",
    "Gangapur": "Gangapurcity",
    "Gangavalli": "Salem",
    "Gangawati": "Koppal",
    "Gauribidanur": "Chikkaballapura",
    "Gauriganj": "Amethi",
    "Ghanari": "Una",
    "Ghaziabad": "Ghaziabad",
    "Gobichettipalayam": "Erode",
    "Gogunda": "Udaipur",
    "Gokak": "Belagavi",
    "Gollaprolu": "Kakinada",
    "Gorakhpur": "Gorakhpur",
    "Greater Noida": "Gautam Buddha Nagar",
    "Gubbi": "Tumakuru",
    "Gudivada": "Krishna",
    "Gudiyatham": "Vellore",
    "Gudlavalleru": "Krishna",
    "Gudur": "Tirupati",
    "Gulabpura": "Bhilwara",
    "Gummidipoondi": "Thiruvallur",
    "Guntakal": "Ananthapuramu",
    "Guntur": "Guntur",
    "Gurugram": "Gurugram",
    "Guruvayur": "Thrissur",
    "Hadagalli": "Vijayanagara",
    "Hagaribommanahalli": "Vijayanagara",
    "Hanamkonda": "Hanumakonda",
    "Handia": "Prayagraj",
    "Hanur": "Chamarajanagara",
    "Hardoi": "Hardoi",
    "Harihar": "Davanagere",
    "Harohalli": "Ramanagara",
    "Haroli": "Una",
    "Harraiya": "Basti",
    "Harur": "Dharmapuri",
    "Hasanparthy": "Hanumakonda",
    "Hassan": "Hassan",
    "Hata": "Kushi Nagar",
    "Hathras": "Hathras",
    "Haveri": "Haveri",
    "Heggadadevankote": "Mysuru",
    "Hindaun": "Karauli",
    "Hindoli": "Bundi",
    "Hindupur": "Sri Sathya Sai",
    "Hirekerur": "Haveri",
    "Hiriyur": "Chitradurga",
    "Holalkere": "Chitradurga",
    "Hole Narsipur": "Hassan",
    "Hosakote": "Bengaluru Rural",
    "Hosanagara": "Shivamogga",
    "Hosapete": "Vijayanagara",
    "Hosur": "Krishnagiri",
    "Hubballi": "Dharwad",
    "Hukeri": "Belagavi",
    "Hunsur": "Mysuru",
    "Huzurabad": "Karimnagar",
    "Hyderabad": "Hyderabad",
    "Ibrahimpatnam": "NTR",
    "Irinjalakuda": "Thrissur",
    "Iritty": "Kannur",
    "Ispur": "Una",
    "Jaggampeta": "Kakinada",
    "Jaggayyapeta": "NTR",
    "Jagitial": "Jagtial",
    "Jaipur": "Jaipur",
    "Jaisalmer": "Jaisalmer",
    "Jaitaran": "Beawar",
    "Jalaun": "Jalaun",
    "Jalor": "Jalore",
    "Jamkhandi": "Bagalkote",
    "Jamwa Ramgarh": "Jaipur Rural",
    "Jangareddigudem": "Eluru",
    "Jangoan": "Jangaon",
    "Jaunpur": "Jaunpur",
    "Jawalamukhi": "Kangra",
    "Jevargi": "Kalaburagi",
    "Jewar": "Gautam Buddha Nagar",
    "Jhalrapatan": "Jhalawar",
    "Jhansi": "Jhansi",
    "Jhunjhunun": "Jhunjhunu",
    "Jodhpur": "Jodhpur",
    "Jogindernagar": "Mandi",
    "K V Kuppam": "Vellore",
    "Kadapa": "YSR",
    "Kadayampatti": "Salem",
    "Kadayanallur": "Tenkasi",
    "Kadiri": "Sri Sathya Sai",
    "Kadur": "Chikkamagaluru",
    "Kajuluru": "Kakinada",
    "Kakinada": "Kakinada",
    "Kalaburagi": "Kalaburagi",
    "Kalka": "Panchkula",
    "Kalkulam": "Kanniyakumari",
    "Kallakkurichi": "Kallakurichi",
    "Kallur": "Kurnool",
    "Kamalapur": "Kalaburagi",
    "Kaman": "Deeg",
    "Kamareddy": "Kamareddy",
    "Kambam": "Theni",
    "Kampli": "Ballari",
    "Kamuthi": "Ramanathapuram",
    "Kanakapura": "Ramanagara",
    "Kancheepuram": "Kancheepuram",
    "Kangeyam": "Tiruppur",
    "Kanjirappally": "Kottayam",
    "Kankipadu": "Krishna",
    "Kannur": "Kannur",
    "Kanod": "Udaipur",
    "Kanpur": "Kanpur Nagar",
    "Kanyakumari": "Kanniyakumari",
    "Kapeshera": "South West Delhi",
    "Kapu": "Udupi",
    "Karaikal": "Karaikal",
    "Karaikkudi": "Sivaganga",
    "Karauli": "Karauli",
    "Karimnagar": "Karimnagar",
    "Karkal": "Udupi",
    "Karthikappally": "Alappuzha",
    "Karunagappally": "Kollam",
    "Karur": "Karur",
    "Kasaragod": "Kasaragod",
    "Kasya": "Kushi Nagar",
    "Kathumar": "Alwar",
    "Katpadi": "Vellore",
    "Kattakkada": "Thiruvananthapuram",
    "Kattumannarkoil": "Cuddalore",
    "Kavali": "SPSR Nellore",
    "Kekri": "Kekri",
    "Kerakat": "Jaunpur",
    "Keshoraipatan": "Bundi",
    "Khammam": "Khammam",
    "Khanapur": "Belagavi",
    "Khanpur": "Jhalawar",
    "Kharar": "SAS Nagar",
    "Khazipet": "Hanumakonda",
    "Khendela": "Sikar",
    "Khurja": "Bulandshahr",
    "Kilimanoor": "Thiruvananthapuram",
    "Killiyoor": "Kanniyakumari",
    "Kilvelur": "Nagapattinam",
    "Kishanganj": "Baran",
    "Kishangarh": "Ajmer",
    "Kishangarh Bas": "Khairthal-Tijara",
    "Kochi": "Ernakulam",
    "Kodad": "Suryapet",
    "Kodumudi": "Erode",
    "Kodungallur": "Thrissur",
    "Kodur": "Annamayya",
    "Kolar": "Kolar",
    "Kolar Gold Field": "Kolar",
    "Kollam": "Kollam",
    "Kollegal": "Chamarajanagara",
    "Koothanallur": "Thiruvarur",
    "Koppa": "Chikkamagaluru",
    "Koppal": "Koppal",
    "Koratagere": "Tumakuru",
    "Korutla": "Jagtial",
    "Kota": "Kota",
    "Kothamangalam": "Ernakulam",
    "Kothapeta": "Dr BR Ambedkar Konaseema",
    "Kothavalasa": "Vizianagaram",
    "Kotli": "Mandi",
    "Kottarakkara": "Kollam",
    "Kottayam": "Kottayam",
    "Kovilpatti": "Thoothukudi",
    "Kovur": "SPSR Nellore",
    "Koyilandy": "Kozhikode",
    "Kozhenchery": "Pathanamthitta",
    "Kozhikode": "Kozhikode",
    "Krishnagiri": "Krishnagiri",
    "Krishnarajanagara": "Mysuru",
    "Kuchaman": "Didwana-Kuchaman",
    "Kudavasal": "Thiruvarur",
    "Kulithalai": "Karur",
    "Kullu": "Kullu",
    "Kumarapalayam": "Namakkal",
    "Kumbakonam": "Thanjavur",
    "Kumher": "Deeg",
    "Kundapura": "Udupi",
    "Kundrathur": "Kancheepuram",
    "Kunnamkulam": "Thrissur",
    "Kunnathunad": "Ernakulam",
    "Kunnathur": "Kollam",
    "Kurabad": "Udaipur",
    "Kurinjipadi": "Cuddalore",
    "Kurnool": "Kurnool",
    "Kuthalam": "Mayiladuthurai",
    "Kuttanad": "Alappuzha",
    "Kuzhittura": "Kanniyakumari",
    "Lachhmangarh": "Sikar",
    "Lalganj": "Azamgarh",
    "Lalgudi": "Tiruchirappalli",
    "Lalsot": "Dausa",
    "Loni": "Ghaziabad",
    "Lucknow": "Lucknow",
    "Machilipatnam": "Krishna",
    "Madanapalle": "Annamayya",
    "Madathukulam": "Tiruppur",
    "Madikeri": "Kodagu",
    "Madurai": "Madurai",
    "Maduranthakam": "Chengalpattu",
    "Mahabubabad": "Mahabubabad",
    "Mahabubnagar": "Mahabubnagar",
    "Maharajganj": "Rae Bareli",
    "Mahwa": "Dausa",
    "Makrana": "Didwana-Kuchaman",
    "Mallappally": "Pathanamthitta",
    "Manachanallur": "Tiruchirappalli",
    "Manali": "Kullu",
    "Manamelkudi": "Pudukkottai",
    "Manapparai": "Tiruchirappalli",
    "Mandalgarh": "Bhilwara",
    "Mandawar": "Dausa",
    "Mandi": "Mandi",
    "Mandya": "Mandya",
    "Mangalagiri": "Guntur",
    "Mangaluru": "Dakshina Kannada",
    "Mangrol": "Baran",
    "Manjeri": "Malappuram",
    "Manjeswaram": "Kasaragod",
    "Manmangalam": "Karur",
    "Mannargudi": "Thiruvarur",
    "Mannarkad": "Palakkad",
    "Mapusa": "North Goa",
    "Marakanam": "Viluppuram",
    "Margao": "South Goa",
    "Marungapuri": "Tiruchirappalli",
    "Mathura": "Mathura",
    "Maunath Bhanjan": "Mau",
    "Mavala": "Adilabad",
    "Mavelikkara": "Alappuzha",
    "Mavli": "Udaipur",
    "Mayiladuthurai": "Mayiladuthurai",
    "Medipally": "Medchal-Malkajgiri",
    "Mehatpur": "Rupnagar",
    "Melur": "Madurai",
    "Metpalli": "Jagtial",
    "Mettupalayam": "Coimbatore",
    "Mettur": "Salem",
    "Mirzapur": "Mirzapur",
    "Modakkurichi": "Erode",
    "Modinagar": "Ghaziabad",
    "Mohanlalganj": "Lucknow",
    "Moodubidire": "Dakshina Kannada",
    "Mosara": "Nizamabad",
    "Muddebihal": "Vijayapura",
    "Mudhol": "Bagalkote",
    "Mughalsarai": "Chandauli",
    "Muhammadabad Gohna": "Mau",
    "Mulki": "Dakshina Kannada",
    "Mundgod": "Uttara Kannada",
    "Munnar": "Idukki",
    "Musiri": "Tiruchirappalli",
    "Muvattupuzha": "Ernakulam",
    "Mylavaram": "NTR",
    "Mysuru": "Mysuru",
    "Nadaun": "Hamirpur",
    "Nagapattinam": "Nagapattinam",
    "Nagar": "Deeg",
    "Nagercoil": "Kanniyakumari",
    "Naidupet": "Tirupati",
    "Najafgarh": "South West Delhi",
    "Nalagarh": "Solan",
    "Nalgonda": "Nalgonda",
    "Nallampalli": "Dharmapuri",
    "Namakkal": "Namakkal",
    "Nandikotkur": "Nandyal",
    "Nandyal": "Nandyal",
    "Nangal": "Rupnagar",
    "Nanguneri": "Tirunelveli",
    "Nanjangud": "Mysuru",
    "Narsampet": "Warangal",
    "Nasirabad": "Ajmer",
    "Natham": "Dindigul",
    "Nautanwa": "Maharajganj",
    "Navipet": "Nizamabad",
    "Nawalgarh": "Jhunjhunu",
    "Nedumangad": "Thiruvananthapuram",
    "Needamangalam": "Thiruvarur",
    "Neem-Ka-Thana": "Neem Ka Thana",
    "Neemrana": "Kotputli-Behror",
    "Nelamangala": "Bengaluru Rural",
    "Nellore": "SPSR Nellore",
    "Nemili": "Ranipet",
    "New Delhi": "Central Delhi",
    "Neyveli": "Cuddalore",
    "Neyyattinkara": "Thiruvananthapuram",
    "Nilakkottai": "Dindigul",
    "Nilambur": "Malappuram",
    "Nilamel": "Kollam",
    "Nimbahera": "Chittorgarh",
    "Nippani": "Belagavi",
    "Nirmal": "Nirmal",
    "Niwai": "Tonk",
    "Nizamabad": "Nizamabad",
    "Noida": "Gautam Buddha Nagar",
    "Nuzvid": "Eluru",
    "Nyamathi": "Davanagere",
    "Oddanchatram": "Dindigul",
    "Omalur": "Salem",
    "Ongole": "Prakasam",
    "Orai": "Jalaun",
    "Orathanadu": "Thanjavur",
    "Osian": "Jodhpur Rural",
    "Ottappalam": "Palakkad",
    "Pachpadra": "Balotra",
    "Pachpahar": "Jhalawar",
    "Padhar": "Mandi",
    "Padrauna": "Kushi Nagar",
    "Pala": "Kottayam",
    "Palakkad": "Palakkad",
    "Palakkodu": "Dharmapuri",
    "Palani": "Dindigul",
    "Palayamkottai": "Tirunelveli",
    "Pali": "Pali",
    "Palladam": "Tiruppur",
    "Pallavaram": "Chengalpattu",
    "Pallipattu": "Thiruvallur",
    "Panaji": "North Goa",
    "Panchkula": "Panchkula",
    "Panruti": "Cuddalore",
    "Papanasam": "Thanjavur",
    "Paramakudi": "Ramanathapuram",
    "Paramathi-Velur": "Namakkal",
    "Paravur": "Ernakulam",
    "Parkal": "Hanumakonda",
    "Pataudi": "Gurugram",
    "Patel Nagar": "West Delhi",
    "Pathanamthitta": "Pathanamthitta",
    "Pattambi": "Palakkad",
    "Pattukkottai": "Thanjavur",
    "Pavagada": "Tumakuru",
    "Payyannur": "Kannur",
    "Pedana": "Krishna",
    "Pedanandipadu": "Guntur",
    "Peddapalli": "Peddapalli",
    "Peddapuram": "Kakinada",
    "Pennagaram": "Dharmapuri",
    "Perambalur": "Perambalur",
    "Peravurani": "Thanjavur",
    "Perinthalmanna": "Malappuram",
    "Periyakulam": "Theni",
    "Pernambut": "Vellore",
    "Pernem": "North Goa",
    "Perumbavoor": "Ernakulam",
    "Perundurai": "Erode",
    "Pharenda": "Maharajganj",
    "Phulpur": "Prayagraj",
    "Pileru": "Annamayya",
    "Pindwara": "Sirohi",
    "Pipalda": "Kota",
    "Piriyapatna": "Mysuru",
    "Pithapuram": "Kakinada",
    "Pochampalli": "Krishnagiri",
    "Pokaran": "Jaisalmer",
    "Pollachi": "Coimbatore",
    "Polur": "Tiruvannamalai",
    "Ponda": "South Goa",
    "Ponnampet": "Kodagu",
    "Ponnani": "Malappuram",
    "Ponneri": "Thiruvallur",
    "Ponnur": "Guntur",
    "Poonamallee": "Thiruvallur",
    "Pragpur": "Kangra",
    "Pratapgarh": "Pratapgarh",
    "Prayagraj": "Prayagraj",
    "Proddatur": "YSR",
    "Puducherry": "Puducherry",
    "Pudukkottai": "Pudukkottai",
    "Pugalur": "Karur",
    "Punalur": "Kollam",
    "Puttur": "Dakshina Kannada",
    "Quepem": "South Goa",
    "Rabakavi Banahatti": "Bagalkote",
    "Radhapuram": "Tirunelveli",
    "Rae Bareli": "Rae Bareli",
    "Raghunadhapalem": "Khammam",
    "Raichur": "Raichur",
    "Rajahmundry": "East Godavari",
    "Rajampet": "Annamayya",
    "Rajapalayam": "Virudhunagar",
    "Rajgarh": "Alwar",
    "Rajsamand": "Rajsamand",
    "Ramachandrapuram": "Dr BR Ambedkar Konaseema",
    "Ramagundam": "Peddapalli",
    "Ramanagara": "Ramanagara",
    "Ramanathapuram": "Ramanathapuram",
    "Ramgarh": "Alwar",
    "Ranibennur": "Haveri",
    "Ranni": "Pathanamthitta",
    "Rasipuram": "Namakkal",
    "Rasra": "Ballia",
    "Ravulapalem": "Dr BR Ambedkar Konaseema",
    "Rawatbhata": "Chittorgarh",
    "Rayachoti": "Annamayya",
    "Rebbena": "Kumuram Bheem Asifabad",
    "Reengus": "Sikar",
    "Renigunta": "Tirupati",
    "Rewalsar": "Mandi",
    "Robertsganj": "Sonbhadra",
    "Sadasivpet": "Sangareddy",
    "Sagar": "Shivamogga",
    "Saidpur": "Ghazipur",
    "Sainthal": "Dausa",
    "Salem": "Salem",
    "Salempur": "Deoria",
    "Salon": "Rae Bareli",
    "Samalkota": "Kakinada",
    "Sandur": "Ballari",
    "Sangareddy": "Sangareddy",
    "Sangod": "Kota",
    "Sanguem": "South Goa",
    "Sankarankoil": "Tenkasi",
    "Sankarapuram": "Kallakurichi",
    "Sankari": "Salem",
    "Sankhavaram": "Kakinada",
    "Sarkaghat": "Mandi",
    "Sas Nagar": "SAS Nagar",
    "Sathyamangalam": "Erode",
    "Sattenapalle": "Palnadu",
    "Sattur": "Virudhunagar",
    "Savanur": "Haveri",
    "Secunderabad": "Medchal-Malkajgiri",
    "Sedam": "Kalaburagi",
    "Shahbad": "Baran",
    "Shahpur": "Yadgir",
    "Shahpura": "Jaipur Rural",
    "Shamshabad": "Ranga Reddy",
    "Sheoganj": "Sirohi",
    "Shiggaon": "Haveri",
    "Shikarpur": "Shivamogga",
    "Shivamogga": "Shivamogga",
    "Sholinghur": "Ranipet",
    "Shrimahaveer Ji": "Karauli",
    "Siddipet": "Siddipet",
    "Sidhauli": "Sitapur",
    "Sidlaghatta": "Chikkaballapura",
    "Sikanderpur": "Ballia",
    "Sikar": "Sikar",
    "Sikrai": "Dausa",
    "Sindgi": "Vijayapura",
    "Sindhnur": "Raichur",
    "Sira": "Tumakuru",
    "Sircilla": "Rajanna Sircilla",
    "Sirkali": "Mayiladuthurai",
    "Sirohi": "Sirohi",
    "Sirsi": "Uttara Kannada",
    "Siruguppa": "Ballari",
    "Sitapur": "Sitapur",
    "Sivakasi": "Virudhunagar",
    "Sojat": "Pali",
    "Soraon": "Prayagraj",
    "Sri Madhopur": "Neem Ka Thana",
    "Srikalahasti": "Tirupati",
    "Sriperumbudur": "Kancheepuram",
    "Srivilliputhur": "Virudhunagar",
    "Sultanpur": "Sultanpur",
    "Sulur": "Coimbatore",
    "Sumerpur": "Pali",
    "Sundarnagar": "Mandi",
    "Sunel": "Jhalawar",
    "Surajgarh": "Jhunjhunu",
    "T Sundupalle": "Annamayya",
    "Tadpatri": "Ananthapuramu",
    "Talera": "Bundi",
    "Taliparamba": "Kannur",
    "Tambaram": "Chengalpattu",
    "Tanuku": "West Godavari",
    "Tenali": "Guntur",
    "Tenkasi": "Tenkasi",
    "Thalassery": "Kannur",
    "Thallarevu": "Kakinada",
    "Thamarassery": "Kozhikode",
    "Thanjavur": "Thanjavur",
    "Tharangambadi": "Mayiladuthurai",
    "Theni": "Theni",
    "Thirumangalam": "Madurai",
    "Thirunallar": "Karaikal",
    "Thirupparankundram": "Madurai",
    "Thiruthuraipoondi": "Thiruvarur",
    "Thiruvaiyaru": "Thanjavur",
    "Thiruvalla": "Pathanamthitta",
    "Thiruvallur": "Thiruvallur",
    "Thiruvananthapuram": "Thiruvananthapuram",
    "Thiruvarur": "Thiruvarur",
    "Thiruvattar": "Kanniyakumari",
    "Thiruvidaimarudur": "Thanjavur",
    "Thoothukkudi": "Thoothukudi",
    "Thovala": "Kanniyakumari",
    "Thrissur": "Thrissur",
    "Thuraiyur": "Tiruchirappalli",
    "Tikota": "Vijayapura",
    "Tindivanam": "Viluppuram",
    "Tiptur": "Tumakuru",
    "Tirthahalli": "Shivamogga",
    "Tiruchendur": "Thoothukudi",
    "Tiruchengode": "Namakkal",
    "Tiruchirappalli": "Tiruchirappalli",
    "Tirukalukundram": "Chengalpattu",
    "Tirumakudal - Narsipur": "Mysuru",
    "Tirunelveli": "Tirunelveli",
    "Tirupathur": "Tirupathur",
    "Tirupati": "Tirupati",
    "Tiruporur": "Chengalpattu",
    "Tiruppur": "Tiruppur",
    "Tirur": "Malappuram",
    "Tirurangadi": "Malappuram",
    "Tiruttani": "Thiruvallur",
    "Tiruvannamalai": "Tiruvannamalai",
    "Tisayanvilai": "Tirunelveli",
    "Tittakudi": "Cuddalore",
    "Todabhim": "Gangapurcity",
    "Tonk": "Tonk",
    "Tumakuru": "Tumakuru",
    "Tundla": "Firozabad",
    "Tunga": "Jaipur Rural",
    "Tuni": "Kakinada",
    "Uchhain": "Bharatpur",
    "Udaipur": "Udaipur",
    "Udayarpalayam": "Ariyalur",
    "Udhagamandalam": "The Nilgiris",
    "Udumalaipettai": "Tiruppur",
    "Udupi": "Udupi",
    "Ullala": "Dakshina Kannada",
    "Ulundurpettai": "Kallakurichi",
    "Una": "Una",
    "Usilampatti": "Madurai",
    "Uthamapalayam": "Theni",
    "Uthiramerur": "Kancheepuram",
    "Uthukkottai": "Thiruvallur",
    "Uthukuli": "Tiruppur",
    "Vadipatti": "Madurai",
    "Vaibhavvadi": "Sindhudurg",
    "Vaikom": "Kottayam",
    "Vandalur": "Chengalpattu",
    "Vandavasi": "Tiruvannamalai",
    "Vaniyambadi": "Tirupathur",
    "Varanasi": "Varanasi",
    "Varkala": "Thiruvananthapuram",
    "Vasco Da Gama": "South Goa",
    "Vatakara": "Kozhikode",
    "Vazhapadi": "Salem",
    "Vedaranyam": "Nagapattinam",
    "Vedasandur": "Dindigul",
    "Veerakeralamputhur": "Tenkasi",
    "Vellore": "Vellore",
    "Vembakkam": "Tiruvannamalai",
    "Vemulawada": "Rajanna Sircilla",
    "Vijayapura": "Vijayapura",
    "Vijayawada": "NTR",
    "Vijaynagar": "Beawar",
    "Villianur": "Viluppuram",
    "Viluppuram": "Viluppuram",
    "Virajpet": "Kodagu",
    "Virudhachalam": "Cuddalore",
    "Virudhunagar": "Virudhunagar",
    "Visakhapatnam": "Visakhapatanam",
    "Vizianagaram": "Vizianagaram",
    "Vrindavan": "Mathura",
    "Vuyyuru": "Krishna",
    "Wadakkancherry": "Thrissur",
    "Walajabad": "Kancheepuram",
    "Wallajah": "Ranipet",
    "Warangal": "Warangal",
    "Yadgir": "Yadgir",
    "Yanam": "Yanam",
    "Yedapally": "Nizamabad",
    "Yeleswaram": "Kakinada",
    "Yemmiganur": "Kurnool",
    "Zirakpur": "SAS Nagar",
}

# [ID, Locality Name, City]
AREAS = [
    ["Adyar", "Adyar", "Chennai"],   # Chennai HQ
    ["Ambattur", "Ambattur", "Chennai"],   # Chennai HQ
    ["Ameerpet", "Ameerpet", "Hyderabad"],   # Hyderabad HQ
    ["Anna Nagar - Chennai", "Anna Nagar", "Chennai"],   # Chennai HQ
    ["Anna Nagar - Madurai", "Anna Nagar", "Madurai"],   # Madurai HQ
    ["Banashankari", "Banashankari", "Bengaluru Urban"],   # Bangalore HQ
    ["Bhima Nagar", "Bhima Nagar", "Tiruchirappalli"],   # Trichy HQ
    ["Centre City", "Centre City", "Hyderabad"],   # Hyderabad HQ; Mapbox did not know it -> the HQ city
    ["Dilsukhnagar", "Dilsukhnagar", "Ranga Reddy"],   # Hyderabad HQ
    ["Fourhouse", "Fourhouse", "Salem"],   # Salem HQ; Mapbox did not know it -> the HQ city
    ["Gandhipuram", "Gandhipuram", "Coimbatore"],   # Coimbatore HQ
    ["GTPT", "GTPT", "Chennai"],   # Chennai HQ; Mapbox did not know it -> the HQ city
    ["Hayathnagar", "Hayathnagar", "Ranga Reddy"],   # Hyderabad HQ
    ["HITEC City", "HITEC City", "Ranga Reddy"],   # Hyderabad HQ
    ["Indiranagar", "Indiranagar", "Bengaluru Urban"],   # Bangalore HQ
    ["Iyer Bungalow", "Iyer Bungalow", "Madurai"],   # Madurai HQ; Mapbox did not know it -> the HQ city
    ["J.P. Nagar", "J.P. Nagar", "Bengaluru Urban"],   # Bangalore HQ
    ["Jaipur Old City", "Jaipur Old City", "Jaipur"],   # Jaipur HQ; Mapbox did not know it -> the HQ city
    ["Jayadeva", "Jayadeva", "Bengaluru Urban"],   # Bangalore HQ; Mapbox did not know it -> the HQ city
    ["Jayanagar", "Jayanagar", "Bengaluru Urban"],   # Bangalore HQ
    ["K.K. Nagar", "K.K. Nagar", "Madurai"],   # Madurai HQ
    ["Kacheripady", "Kacheripady", "Ernakulam"],   # Cochin HQ
    ["Kallur - Thrissur", "Kallur", "Thrissur"],   # Cochin HQ
    ["Koramangala", "Koramangala", "Bengaluru Urban"],   # Bangalore HQ
    ["Kukatpally", "Kukatpally", "Medchal-Malkajgiri"],   # Hyderabad HQ
    ["Malleswaram", "Malleswaram", "Bengaluru Urban"],   # Bangalore HQ
    ["Mansarovar", "Mansarovar", "Jaipur"],   # Jaipur HQ
    ["Mylapore", "Mylapore", "Chennai"],   # Chennai HQ
    ["Mysore Jayadeva", "Mysore Jayadeva", "Mysuru"],   # Mysore HQ
    ["Old City", "Old City", "Hyderabad"],   # Hyderabad HQ; Mapbox did not know it -> the HQ city
    ["Padi", "Padi", "Chennai"],   # Chennai HQ
    ["Palanganatham", "Palanganatham", "Madurai"],   # Madurai HQ; Mapbox did not know it -> the HQ city
    ["Paota", "Paota", "Jodhpur"],   # Jodhpur HQ
    ["Perambur", "Perambur", "Chennai"],   # Chennai HQ
    ["Periya Kovil", "Periya Kovil", "Thanjavur"],   # Tanjore HQ; Mapbox did not know it -> the HQ city
    ["R.R. Nagar", "R.R. Nagar", "Bengaluru Urban"],   # Bangalore HQ
    ["R.S. Puram", "R.S. Puram", "Coimbatore"],   # Coimbatore HQ
    ["R.T. Nagar", "R.T. Nagar", "Bengaluru Urban"],   # Bangalore HQ
    ["Rajajinagar", "Rajajinagar", "Bengaluru Urban"],   # Bangalore HQ; Mapbox did not know it -> the HQ city
    ["Seelanayakkanpatti", "Seelanayakkanpatti", "Salem"],   # Salem HQ; Mapbox did not know it -> the HQ city
    ["Shastri Nagar", "Shastri Nagar", "Jodhpur"],   # Jodhpur HQ
    ["Shivajinagar", "Shivajinagar", "Bengaluru Urban"],   # Bangalore HQ; Mapbox did not know it -> the HQ city
    ["Sinniyampalayam", "Sinniyampalayam", "Coimbatore"],   # Coimbatore HQ; Mapbox did not know it -> the HQ city
    ["T. Nagar", "T. Nagar", "Chennai"],   # Chennai HQ
    ["Thudiyalur", "Thudiyalur", "Coimbatore"],   # Coimbatore HQ
    ["Vadapalani", "Vadapalani", "Chennai"],   # Chennai HQ
    ["Vellakoil", "Vellakoil", "Erode"],   # Erode HQ
    ["Vidhyadhar Nagar", "Vidhyadhar Nagar", "Jaipur"],   # Jaipur HQ
    ["Vijayanagar", "Vijayanagar", "Bengaluru Urban"],   # Bangalore HQ
    ["Whitefield", "Whitefield", "Bengaluru Urban"],   # Bangalore HQ
    ["Woraiyur", "Woraiyur", "Tiruchirappalli"],   # Trichy HQ
    ["Yeshwanthpur", "Yeshwanthpur", "Bengaluru Urban"],   # Bangalore HQ
]

if not frappe.db.exists("DocType", "Locality"):
    frappe.throw("No Locality DocType on this ERP -- run locality_console.py first.")

# 1. the field
dt = frappe.get_doc("DocType", "Locality")
has_city = False
for f in dt.fields:
    if f.fieldname == "city":
        has_city = True
uniq = False
for f in dt.fields:
    if f.fieldname == "locality_name" and f.unique:
        uniq = True
if has_city and not uniq:
    print("ok: Locality has City, Locality Name is not unique")
else:
    print(W + "DocType Locality: " + ("" if has_city else "add field city (City); ") + ("Locality Name no longer unique" if uniq else ""))
    if not DRY:
        for f in dt.fields:
            if f.fieldname == "locality_name":
                f.unique = 0
        if not has_city:
            dt.append("fields", {"fieldname": "city", "label": "City", "fieldtype": "Data", "in_list_view": 1,
                                 "in_standard_filter": 1, "description": "The district the locality is in"})
        dt.save(ignore_permissions=True)

# 2. City on the towns
fill = []
for name in TOWN_CITY:
    if frappe.db.exists("Locality", name):
        cur = frappe.db.get_value("Locality", name, "city") if (has_city or not DRY) else ""
        if not cur:
            fill.append(name)
print(W + "set City on " + str(len(fill)) + " of " + str(len(TOWN_CITY)) + " town localities (e.g. Tambaram -> " + TOWN_CITY.get("Tambaram", "") + ", Hosur -> " + TOWN_CITY.get("Hosur", "") + ")")
if not DRY:
    for name in fill:
        frappe.db.set_value("Locality", name, "city", TOWN_CITY[name], update_modified=False)

# 3. the Base Areas
add = []
for a in AREAS:
    if not frappe.db.exists("Locality", a[0]):
        add.append(a)
print(W + "add " + str(len(add)) + " of " + str(len(AREAS)) + " base areas:")
for a in add:
    print("   " + a[0] + ("" if a[0] == a[1] else "   (name " + a[1] + ")") + "   City " + a[2])
if not DRY:
    for a in add:
        frappe.get_doc({"doctype": "Locality", "locality_name": a[1], "city": a[2]}).insert(ignore_permissions=True, set_name=a[0])
        if a[0] != a[1]:
            # the DocType names by locality_name, so the insert copied the ID ("Kallur - Thrissur") into
            # the name field -- put the plain name back (19 Nov 2026)
            frappe.db.set_value("Locality", a[0], "locality_name", a[1], update_modified=False)
    print("done -- Locality now has " + str(frappe.db.count("Locality")) + " records; with no City: "
          + str(frappe.db.sql("select count(*) from `tabLocality` where ifnull(city, '') = ''")[0][0]) + ".")
else:
    print("dry run -- nothing changed.")
