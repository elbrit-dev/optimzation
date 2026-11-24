# SYSTEM CONSOLE -- the Locality DocType: just the area name, one record per Map Town (19 Nov 2026).
# Run on BOTH ERPs (prod and UAT), logged in as Administrator:
#   Desk > System Console, type Python: paste all of this.
#   1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run: it only adds what is missing.
#
#   1. DocType "Locality" (custom, module Custom). ONE field: locality_name (Locality Name), required, unique;
#      the record's ID is the name itself ("Chennai"). No Locality Type, no HQ, no Offset (the user, 19 Nov 2026).
#      - not there yet (prod): created.
#      - already there (UAT, made 9 Nov with locality_type / hq / offset): those fields are removed.
#   2. Records: one per Map Town. TOWNS below = the 751 unique custom_map_town values on prod doctors
#      (Lead) on 19 Nov 2026, PLUS any town the doctors on this ERP have now (read at run time, so a
#      re-run picks up new towns). UAT doctors have no Map Town yet -> UAT gets the same 751 as prod.
#   3. Records that are not a town are DELETED (UAT: the 614 "HQ-x" / "EQ-x" records of 9 Nov), so
#      UAT ends up the same as prod. Nothing links to Locality (checked on UAT 19 Nov: no Link field,
#      no script uses the DocType).
#
# Permissions as on UAT: System Manager full, Sales User read.

DRY = True
W = "WOULD " if DRY else ""

TOWNS = [
    "Aandhi", "Adilabad", "Adoni", "Adoor", "Agiripalle", "Agra", "Ahore", "Ajjampura", "Ajmer", "Akbarpur",
    "Aklera", "Alangulam", "Alappuzha", "Alathur", "Aligarh", "Aluva", "Alwar", "Amalapuram", "Amb",
    "Ambalappuzha", "Ambasamudram", "Ambur", "Amethi", "Anaicut", "Anakapalle", "Anantapur", "Andipatti",
    "Anekal", "Antah", "Anthiyur", "Arakonam", "Arani", "Aranthangi", "Arcot", "Ariyalur", "Armoor",
    "Arrekode", "Aruppukkottai", "Asind", "Athani", "Atmakur", "Atru", "Attingal", "Attur", "Auraiya",
    "Auroville", "Avadi", "Avinashi", "Ayodhya", "Azamgarh", "Badgaon", "Badshahpur", "Bagalkot", "Bagepalli",
    "Bahour", "Bairia", "Bakshi Ka Talab", "Baldwara", "Balh", "Ballari", "Ballia", "Banda", "Bandikui",
    "Bangana", "Bangarapet", "Bansdih", "Bansgaon", "Bantval", "Bara", "Barabanki", "Baran", "Barmer",
    "Barsar", "Basavakalyan", "Bassi", "Basti", "Baswa", "Bayana", "Beawar", "Behror", "Belagavi",
    "Beltangadi", "Belthara Road", "Bengaluru", "Bhadohi", "Bhadrajun", "Bhadravati", "Bharatpur", "Bhavani",
    "Bhilwara", "Bhinmal", "Bhuntar", "Bhuvanagiri", "Bicholim", "Bidar", "Bijoliya", "Bilara", "Bilaspur",
    "Bodhan", "Bodinayakanur", "Brahmavara", "Buchireddipalem", "Budalur", "Bukkaraya Samudram",
    "Bulandshahr", "Bundi", "Burhanpur", "Chaksu", "Chalakkudy", "Challakere", "Chamarajanagar", "Chandigarh",
    "Changanassery", "Channagiri", "Channapatna", "Channarayapatna", "Chengalpattu", "Chengannur", "Chennai",
    "Cheranmahadevi", "Cherthala", "Cheyyar", "Cheyyur", "Chhabra", "Chhipabarod", "Chhoti Sadri",
    "Chidambaram", "Chikkaballapura", "Chikkamagaluru", "Chikkodi", "Chilakaluripet", "Chinnasalem",
    "Chintamani", "Chitradurga", "Chittaurgarh", "Chittoor", "Chittur", "Chomu", "Churu", "Coimbatore",
    "Coonoor", "Cuddalore", "Dadasiba", "Dadri", "Danta Ramgarh", "Dausa", "Davanagere", "Deeg", "Delwara",
    "Deoria", "Dera Gopipur", "Devakottai", "Devanahalli", "Dharapuram", "Dharmapuri", "Dharmavaram",
    "Dharwad", "Dhaulpur", "Digod", "Dindigul", "Dodda Ballapur", "Dwarka", "Edappadi", "Elkathurthy",
    "Eluru", "Eral", "Ernakulam", "Erode", "Erumely", "Etawah", "Etmadpur", "Faizabad", "Faridabad",
    "Farooqnagar", "Farrukhabad", "Fatehgarh Sahib", "Fatehpur", "Firozabad", "Gadag", "Gagret",
    "Gandarvakkottai", "Gangapur", "Gangavalli", "Gangawati", "Gauribidanur", "Gauriganj", "Ghanari",
    "Ghaziabad", "Gobichettipalayam", "Gogunda", "Gokak", "Gollaprolu", "Gorakhpur", "Greater Noida", "Gubbi",
    "Gudivada", "Gudiyatham", "Gudlavalleru", "Gudur", "Gulabpura", "Gummidipoondi", "Guntakal", "Guntur",
    "Gurugram", "Guruvayur", "Hadagalli", "Hagaribommanahalli", "Hanamkonda", "Handia", "Hanur", "Hardoi",
    "Harihar", "Harohalli", "Haroli", "Harraiya", "Harur", "Hasanparthy", "Hassan", "Hata", "Hathras",
    "Haveri", "Heggadadevankote", "Hindaun", "Hindoli", "Hindupur", "Hirekerur", "Hiriyur", "Holalkere",
    "Hole Narsipur", "Hosakote", "Hosanagara", "Hosapete", "Hosur", "Hubballi", "Hukeri", "Hunsur",
    "Huzurabad", "Hyderabad", "Ibrahimpatnam", "Irinjalakuda", "Iritty", "Ispur", "Jaggampeta",
    "Jaggayyapeta", "Jagitial", "Jaipur", "Jaisalmer", "Jaitaran", "Jalaun", "Jalor", "Jamkhandi",
    "Jamwa Ramgarh", "Jangareddigudem", "Jangoan", "Jaunpur", "Jawalamukhi", "Jevargi", "Jewar",
    "Jhalrapatan", "Jhansi", "Jhunjhunun", "Jodhpur", "Jogindernagar", "K V Kuppam", "Kadapa", "Kadayampatti",
    "Kadayanallur", "Kadiri", "Kadur", "Kajuluru", "Kakinada", "Kalaburagi", "Kalka", "Kalkulam",
    "Kallakkurichi", "Kallur", "Kamalapur", "Kaman", "Kamareddy", "Kambam", "Kampli", "Kamuthi", "Kanakapura",
    "Kancheepuram", "Kangeyam", "Kanjirappally", "Kankipadu", "Kannur", "Kanod", "Kanpur", "Kanyakumari",
    "Kapeshera", "Kapu", "Karaikal", "Karaikkudi", "Karauli", "Karimnagar", "Karkal", "Karthikappally",
    "Karunagappally", "Karur", "Kasaragod", "Kasya", "Kathumar", "Katpadi", "Kattakkada", "Kattumannarkoil",
    "Kavali", "Kekri", "Kerakat", "Keshoraipatan", "Khammam", "Khanapur", "Khanpur", "Kharar", "Khazipet",
    "Khendela", "Khurja", "Kilimanoor", "Killiyoor", "Kilvelur", "Kishanganj", "Kishangarh", "Kishangarh Bas",
    "Kochi", "Kodad", "Kodumudi", "Kodungallur", "Kodur", "Kolar", "Kolar Gold Field", "Kollam", "Kollegal",
    "Koothanallur", "Koppa", "Koppal", "Koratagere", "Korutla", "Kota", "Kothamangalam", "Kothapeta",
    "Kothavalasa", "Kotli", "Kottarakkara", "Kottayam", "Kovilpatti", "Kovur", "Koyilandy", "Kozhenchery",
    "Kozhikode", "Krishnagiri", "Krishnarajanagara", "Kuchaman", "Kudavasal", "Kulithalai", "Kullu",
    "Kumarapalayam", "Kumbakonam", "Kumher", "Kundapura", "Kundrathur", "Kunnamkulam", "Kunnathunad",
    "Kunnathur", "Kurabad", "Kurinjipadi", "Kurnool", "Kuthalam", "Kuttanad", "Kuzhittura", "Lachhmangarh",
    "Lalganj", "Lalgudi", "Lalsot", "Loni", "Lucknow", "Machilipatnam", "Madanapalle", "Madathukulam",
    "Madikeri", "Madurai", "Maduranthakam", "Mahabubabad", "Mahabubnagar", "Maharajganj", "Mahwa", "Makrana",
    "Mallappally", "Manachanallur", "Manali", "Manamelkudi", "Manapparai", "Mandalgarh", "Mandawar", "Mandi",
    "Mandya", "Mangalagiri", "Mangaluru", "Mangrol", "Manjeri", "Manjeswaram", "Manmangalam", "Mannargudi",
    "Mannarkad", "Mapusa", "Marakanam", "Margao", "Marungapuri", "Mathura", "Maunath Bhanjan", "Mavala",
    "Mavelikkara", "Mavli", "Mayiladuthurai", "Medipally", "Mehatpur", "Melur", "Metpalli", "Mettupalayam",
    "Mettur", "Mirzapur", "Modakkurichi", "Modinagar", "Mohanlalganj", "Moodubidire", "Mosara", "Muddebihal",
    "Mudhol", "Mughalsarai", "Muhammadabad Gohna", "Mulki", "Mundgod", "Munnar", "Musiri", "Muvattupuzha",
    "Mylavaram", "Mysuru", "Nadaun", "Nagapattinam", "Nagar", "Nagercoil", "Naidupet", "Najafgarh",
    "Nalagarh", "Nalgonda", "Nallampalli", "Namakkal", "Nandikotkur", "Nandyal", "Nangal", "Nanguneri",
    "Nanjangud", "Narsampet", "Nasirabad", "Natham", "Nautanwa", "Navipet", "Nawalgarh", "Nedumangad",
    "Needamangalam", "Neem-Ka-Thana", "Neemrana", "Nelamangala", "Nellore", "Nemili", "New Delhi", "Neyveli",
    "Neyyattinkara", "Nilakkottai", "Nilambur", "Nilamel", "Nimbahera", "Nippani", "Nirmal", "Niwai",
    "Nizamabad", "Noida", "Nuzvid", "Nyamathi", "Oddanchatram", "Omalur", "Ongole", "Orai", "Orathanadu",
    "Osian", "Ottappalam", "Pachpadra", "Pachpahar", "Padhar", "Padrauna", "Pala", "Palakkad", "Palakkodu",
    "Palani", "Palayamkottai", "Pali", "Palladam", "Pallavaram", "Pallipattu", "Panaji", "Panchkula",
    "Panruti", "Papanasam", "Paramakudi", "Paramathi-Velur", "Paravur", "Parkal", "Pataudi", "Patel Nagar",
    "Pathanamthitta", "Pattambi", "Pattukkottai", "Pavagada", "Payyannur", "Pedana", "Pedanandipadu",
    "Peddapalli", "Peddapuram", "Pennagaram", "Perambalur", "Peravurani", "Perinthalmanna", "Periyakulam",
    "Pernambut", "Pernem", "Perumbavoor", "Perundurai", "Pharenda", "Phulpur", "Pileru", "Pindwara",
    "Pipalda", "Piriyapatna", "Pithapuram", "Pochampalli", "Pokaran", "Pollachi", "Polur", "Ponda",
    "Ponnampet", "Ponnani", "Ponneri", "Ponnur", "Poonamallee", "Pragpur", "Pratapgarh", "Prayagraj",
    "Proddatur", "Puducherry", "Pudukkottai", "Pugalur", "Punalur", "Puttur", "Quepem", "Rabakavi Banahatti",
    "Radhapuram", "Rae Bareli", "Raghunadhapalem", "Raichur", "Rajahmundry", "Rajampet", "Rajapalayam",
    "Rajgarh", "Rajsamand", "Ramachandrapuram", "Ramagundam", "Ramanagara", "Ramanathapuram", "Ramgarh",
    "Ranibennur", "Ranni", "Rasipuram", "Rasra", "Ravulapalem", "Rawatbhata", "Rayachoti", "Rebbena",
    "Reengus", "Renigunta", "Rewalsar", "Robertsganj", "Sadasivpet", "Sagar", "Saidpur", "Sainthal", "Salem",
    "Salempur", "Salon", "Samalkota", "Sandur", "Sangareddy", "Sangod", "Sanguem", "Sankarankoil",
    "Sankarapuram", "Sankari", "Sankhavaram", "Sarkaghat", "Sas Nagar", "Sathyamangalam", "Sattenapalle",
    "Sattur", "Savanur", "Secunderabad", "Sedam", "Shahbad", "Shahpur", "Shahpura", "Shamshabad", "Sheoganj",
    "Shiggaon", "Shikarpur", "Shivamogga", "Sholinghur", "Shrimahaveer Ji", "Siddipet", "Sidhauli",
    "Sidlaghatta", "Sikanderpur", "Sikar", "Sikrai", "Sindgi", "Sindhnur", "Sira", "Sircilla", "Sirkali",
    "Sirohi", "Sirsi", "Siruguppa", "Sitapur", "Sivakasi", "Sojat", "Soraon", "Sri Madhopur", "Srikalahasti",
    "Sriperumbudur", "Srivilliputhur", "Sultanpur", "Sulur", "Sumerpur", "Sundarnagar", "Sunel", "Surajgarh",
    "T Sundupalle", "Tadpatri", "Talera", "Taliparamba", "Tambaram", "Tanuku", "Tenali", "Tenkasi",
    "Thalassery", "Thallarevu", "Thamarassery", "Thanjavur", "Tharangambadi", "Theni", "Thirumangalam",
    "Thirunallar", "Thirupparankundram", "Thiruthuraipoondi", "Thiruvaiyaru", "Thiruvalla", "Thiruvallur",
    "Thiruvananthapuram", "Thiruvarur", "Thiruvattar", "Thiruvidaimarudur", "Thoothukkudi", "Thovala",
    "Thrissur", "Thuraiyur", "Tikota", "Tindivanam", "Tiptur", "Tirthahalli", "Tiruchendur", "Tiruchengode",
    "Tiruchirappalli", "Tirukalukundram", "Tirumakudal - Narsipur", "Tirunelveli", "Tirupathur", "Tirupati",
    "Tiruporur", "Tiruppur", "Tirur", "Tirurangadi", "Tiruttani", "Tiruvannamalai", "Tisayanvilai",
    "Tittakudi", "Todabhim", "Tonk", "Tumakuru", "Tundla", "Tunga", "Tuni", "Uchhain", "Udaipur",
    "Udayarpalayam", "Udhagamandalam", "Udumalaipettai", "Udupi", "Ullala", "Ulundurpettai", "Una",
    "Usilampatti", "Uthamapalayam", "Uthiramerur", "Uthukkottai", "Uthukuli", "Vadipatti", "Vaibhavvadi",
    "Vaikom", "Vandalur", "Vandavasi", "Vaniyambadi", "Varanasi", "Varkala", "Vasco Da Gama", "Vatakara",
    "Vazhapadi", "Vedaranyam", "Vedasandur", "Veerakeralamputhur", "Vellore", "Vembakkam", "Vemulawada",
    "Vijayapura", "Vijayawada", "Vijaynagar", "Villianur", "Viluppuram", "Virajpet", "Virudhachalam",
    "Virudhunagar", "Visakhapatnam", "Vizianagaram", "Vrindavan", "Vuyyuru", "Wadakkancherry", "Walajabad",
    "Wallajah", "Warangal", "Yadgir", "Yanam", "Yedapally", "Yeleswaram", "Yemmiganur", "Zirakpur",
]

# 2. + towns the doctors on this ERP have now
have_col = False
try:
    live = frappe.db.sql("""select distinct custom_map_town from `tabLead` where ifnull(custom_map_town, '') != ''""")
    have_col = len(live) > 0
except Exception:
    live = []
for r in live:
    t = str(r[0]).strip()
    if t and t not in TOWNS:
        TOWNS.append(t)
print(str(len(TOWNS)) + " towns" + ("" if have_col else " (no Map Town on this ERP's doctors: the prod list only)"))
want = {}
for t in TOWNS:
    want[t] = 1

# 1. the DocType
if not frappe.db.exists("DocType", "Locality"):
    print(W + "create DocType Locality (one field: locality_name)")
    if not DRY:
        frappe.get_doc({
            "doctype": "DocType", "name": "Locality", "module": "Custom", "custom": 1,
            "autoname": "field:locality_name", "naming_rule": "By fieldname", "title_field": "locality_name",
            "sort_field": "locality_name", "sort_order": "ASC", "allow_rename": 1, "track_changes": 1,
            "fields": [{"fieldname": "locality_name", "label": "Locality Name", "fieldtype": "Data", "reqd": 1, "unique": 1,
                        "in_list_view": 1, "in_standard_filter": 1, "bold": 1}],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
                {"role": "Sales User", "read": 1, "report": 1},
            ],
        }).insert(ignore_permissions=True)
else:
    # 3. first the records that are not a town (they were named HQ-x / EQ-x by hand)
    old = frappe.get_all("Locality", pluck="name", limit_page_length=0)
    gone = []
    for n in old:
        if not want.get(n):
            gone.append(n)
    print(W + "delete " + str(len(gone)) + " of " + str(len(old)) + " Locality records that are not a town" + ((": " + ", ".join(gone[:8]) + (" ...") if len(gone) > 8 else (": " + ", ".join(gone) if gone else ""))))
    if not DRY:
        for n in gone:
            frappe.delete_doc("Locality", n, ignore_permissions=True, force=True)
    dt = frappe.get_doc("DocType", "Locality")
    extra = []
    keep = []
    for f in dt.fields:
        if f.fieldname == "locality_name":
            keep.append(f)
        else:
            extra.append(f.fieldname)
    print(W + "DocType Locality: remove fields " + (", ".join(extra) if extra else "(none)") + "; ID = the locality name")
    if not DRY:
        dt.fields = keep
        dt.fields[0].reqd = 1
        dt.fields[0].unique = 1
        dt.fields[0].in_list_view = 1
        dt.fields[0].in_standard_filter = 1
        dt.autoname = "field:locality_name"
        dt.naming_rule = "By fieldname"
        dt.title_field = "locality_name"
        dt.sort_field = "locality_name"
        dt.sort_order = "ASC"
        dt.save(ignore_permissions=True)

# 2. the records
add = []
for t in TOWNS:
    if DRY and not frappe.db.exists("DocType", "Locality"):
        add.append(t)
    elif not frappe.db.exists("DocType", "Locality") or not frappe.db.exists("Locality", t):
        add.append(t)
print(W + "add " + str(len(add)) + " Locality records" + ((": " + ", ".join(add[:10]) + " ...") if len(add) > 10 else (": " + ", ".join(add) if add else "")))
if not DRY:
    for t in add:
        frappe.get_doc({"doctype": "Locality", "locality_name": t}).insert(ignore_permissions=True)
    print("done -- Locality now has " + str(frappe.db.count("Locality")) + " records.")
else:
    print("dry run -- nothing changed.")
