/* ==========================================================================
   FPL GAME ON V12 — League tracker configuration (defaults)
   --------------------------------------------------------------------------
   Everything here is a DEFAULT. Anything the organiser changes is saved to
   localStorage (see data.js) and merged over these values, so this file is a
   safe starting point and a single source of truth for the published rules.

   All prize numbers, the month->gameweek map, the LMS elimination grid, the
   pyramid mini-seasons and the H2H schedule are taken from the official
   "Game On V12" graphics. Where a graphic was ambiguous it is flagged with a
   NOTE and can be corrected in Settings -> Admin without touching code.
   ========================================================================== */
(function () {
  "use strict";

  var CONFIG = {
    version: 12,
    seasonLabel: "Game On V12",

    /* ---- Data source -----------------------------------------------------
       The FPL API sends no CORS header, so a browser cannot read it directly.
       Requests are routed through a public CORS proxy. `{url}` is replaced
       with the *encoded* FPL URL. You can change the proxy in Settings if one
       goes down. A couple of known-working templates are listed below. */
    proxy: {
      // Active template. %s / {url} both accepted (see api.js).
      template: "https://api.allorigins.win/raw?url={url}",
      alternatives: [
        "https://api.allorigins.win/raw?url={url}",
        "https://corsproxy.io/?url={url}",
        "https://thingproxy.freeboard.io/fetch/{urlraw}", // {urlraw} = not encoded
        "" // empty = call FPL directly (works only if you host your own proxy at that origin)
      ]
    },

    fplBase: "https://fantasy.premierleague.com/api",

    /* ---- League identity -------------------------------------------------
       Fill these in Settings once. classicLeagueId drives the whole roster
       (all 245 managers). h2hGroupLeagueIds is one FPL H2H league id per
       group (16 of them) — optional; the H2H tab also works from GW scores. */
    classicLeagueId: 478139,   // Game On V12 classic league
    // One FPL H2H league id per group, in order Group A … Group P.
    h2hGroupLeagueIds: [
      831308, 831309, 831313, 831338, 831344, 831346, 831350, 831351,
      831357, 831362, 831367, 831369, 831370, 831372, 831383, 831385
    ],
    expectedManagers: 245,
    joiningFee: null,          // set if you want the pot shown on Home

    totalGameweeks: 38,
    // Calendar year the season starts in (Aug). Used for month labels like
    // "Aug-26"; Jan–May roll over to the next year. Editable in Settings.
    seasonStartYear: 2025,
    // When true, each month's gameweeks are derived automatically from the
    // real fixture deadline dates (bootstrap), so the monthly tab is correct
    // without hand-entering the calendar. Set false to use the gws below.
    autoMonths: true,

    /* ---- Classic league prizes (rank -> amount) -------------------------- */
    classicPrizes: {
      exact: {
        1: 40000, 2: 33000, 3: 26000, 4: 21000, 5: 17000,
        6: 14000, 7: 12000, 8: 10000, 9: 8500, 10: 7000,
        11: 6000, 12: 5000, 13: 4000, 14: 3500, 15: 3000
      },
      // Ranges are inclusive. NOTE: the poster listed "31-45: 1,250" and
      // "36-45: 750" which overlap; the sensible reading (31-35 / 36-45) is
      // used here — adjust in Admin if your league intends otherwise.
      ranges: [
        { from: 16, to: 20, amount: 2500 },
        { from: 21, to: 30, amount: 1750 },
        { from: 31, to: 35, amount: 1250 },
        { from: 36, to: 45, amount: 750 }
      ]
    },

    /* ---- Monthly prizes + which gameweeks belong to each month -----------
       IMPORTANT: gw ranges below are a PLACEHOLDER calendar. Set them in
       Admin to match the real fixture list for your season, otherwise the
       monthly winners will be off. Months run Aug -> May. */
    months: [
      { key: "aug", name: "August",    gws: [1, 2, 3],              prizes: { 1: 1000, 2: 400,  3: 200 } },
      { key: "sep", name: "September", gws: [4, 5, 6],              prizes: { 1: 1500, 2: 600,  3: 300 } },
      { key: "oct", name: "October",   gws: [7, 8, 9],              prizes: { 1: 2000, 2: 800,  3: 400 } },
      { key: "nov", name: "November",  gws: [10, 11, 12, 13],       prizes: { 1: 1500, 2: 600,  3: 300 } },
      { key: "dec", name: "December",  gws: [14, 15, 16, 17, 18, 19], prizes: { 1: 3000, 2: 1200, 3: 600 } },
      { key: "jan", name: "January",   gws: [20, 21, 22, 23, 24],   prizes: { 1: 2500, 2: 1000, 3: 500 } },
      { key: "feb", name: "February",  gws: [25, 26, 27],           prizes: { 1: 2000, 2: 800,  3: 400 } },
      { key: "mar", name: "March",     gws: [28, 29, 30, 31],       prizes: { 1: 1500, 2: 600,  3: 300 } },
      { key: "apr", name: "April",     gws: [32, 33, 34, 35],       prizes: { 1: 1500, 2: 600,  3: 300 } },
      { key: "may", name: "May",       gws: [36, 37, 38],           prizes: { 1: 2500, 2: 1000, 3: 500 } }
    ],

    /* ---- Last Manager Standing ------------------------------------------
       elimPerGw is exact from the elimination grid (sums to 244; 245 -> 1).
       Score for a GW = that GW's net score (already includes hits). Lowest
       scorers among survivors are eliminated. */
    lms: {
      prizes: { champion: 22000, runnerUp: 4500, third: 1750 },
      elimPerGw: buildLmsGrid(),
      // Tie-breakers (for deciding who survives when scores tie), in order.
      // Only the first two are auto-computable from history; the rest need
      // picks/live data and are left to admin override.
      tieBreakers: [
        "Points on bench",
        "More goals in playing XI",
        "More clean sheets in playing XI",
        "More assists in playing XI",
        "Carry the tie forward to next GW"
      ]
    },

    /* ---- Pyramid Battle --------------------------------------------------
       4 divisions, 3 mini-seasons. NOTE the seasons skip GW13 and GW26. */
    pyramid: {
      divisions: [
        { key: "elite",         name: "Elite",         prizes: { 1: 3500, 2: 2350, 3: 1750 } },
        { key: "championship",  name: "Championship",  prizes: { 1: 2750, 2: 1750, 3: 1350 } },
        { key: "challenger",    name: "Challenger",    prizes: { 1: 2000, 2: 1250, 3: 1000 } },
        { key: "conference",    name: "Conference",    prizes: { 1: 1750, 2: 1000, 3: 750 } }
      ],
      seasons: [
        { key: "s1", name: "Mini Season 1", gws: range(1, 12) },
        { key: "s2", name: "Mini Season 2", gws: range(14, 25) },
        { key: "s3", name: "Mini Season 3", gws: range(27, 38) }
      ],
      promoteCount: 5,   // top 5 of each division go up next mini-season
      relegateCount: 5,  // bottom 5 of each division go down next mini-season
      // Season-1 division rosters (from the league one-pager). Manager names
      // are resolved to FPL entry ids against the classic-league roster.
    seasonOneRosterNames: {
      elite: [
        "Aakriti Mehrotra", "Abhishek Thard", "ADWAIT BHATTACHARYA", "Akshay Surve",
        "Aleston Fernandes", "Alson D'souza", "Aman Arora", "Amar Sarvaria",
        "Amit Patil", "Amrish Sawe", "Anurag Red-dy", "Arjun Mahrishi",
        "Arpan Sur", "Ashis Nayak", "Avishek Mitra", "Basil Sam",
        "Bhavin Jatania", "Big Slick", "Bishisht Shome", "Cherag Ramnathan",
        "Dane Pereira", "darrell b", "Devansh Khaitan", "Dhaval Budhdeo",
        "Dhruv Patel", "Geordie Wilson", "Gopal Bhagtani", "hardik s",
        "Harsh Garbyal", "Harsh Tripathi", "Ishaan Ganguly", "Jaidev Tripathy",
        "Jayesh Pawar", "Joash P", "Joy Roychowdhury", "Karan Bhardwaj",
        "Kunaal Dadwal", "LASIL DIAS", "Mahikaansh Reddy", "Neeraj Bhojani",
        "Nehal Reddy", "Neol Goveas", "Niranjan Desai", "Nishit Reddy",
        "Pradyumna Kodali", "Prathap Devadiga", "Rahil Mirchandani", "Ryan Godinho",
        "Samson Baretto", "Sehaj Singh", "Shaun Lalkaka", "Shivamshu Prabhakar",
        "Siddharth Shetty", "Sidharth Shanon", "Srikanth Polisetti", "Tadu Novin",
        "tarakesh kilaru", "Tnmay P Gaude", "Varun Venkatesh", "Vedant Bihani",
        "Viren Khanna"
      ],
      championship: [
        "Abhinav Shankar", "Abhishek Yerra", "Adhitya Vohra", "Aditya Sood",
        "Alimpan Barua", "Aman Mehra", "Aman Morarka", "Aman Sheth",
        "Amit Lakhani", "Amol Varhadé", "Anirudh Kanga", "Ankit Agarwal",
        "Anshul Mohan", "Avi Anand", "Avijeet Alagati", "Avinash Menon",
        "Balraj Snehi", "Bharat Subramaniam", "Bharat Varma", "Chanakya Gupta",
        "Chatanya Mahajan", "Dhruv Haria", "Himanshu Madan", "Himay Kotak",
        "Imlikokba longkumer", "Jeet Shah", "Karan Singh", "Karthik MG",
        "Krishna Moorthy", "Manav Malhotra", "Maryknoll Dsouza", "Nayaab Qamar",
        "Nishant Gupta", "Parin Chheda", "Parth Poddar", "Parth Sanghvi",
        "Rahil Puri", "RaHuL Iyer", "Rohan Devireddy", "Rohan Punjani",
        "Rohit Reddy", "rohit tare", "Sachin Uppal", "Sahil Sankhe",
        "Saptarsi Das", "Shantam Mehra", "Shashank Sabesan", "Shovik Banerjee",
        "Shubham Khandelwal", "Shubham Nigam", "Shubranshu Prabhakar", "Sid Uttam",
        "Sidhant Mankar", "Souradeep Chandra", "Sudarshan Kongbrai", "suraj penukonda",
        "Udit Doshi", "Varun Sood", "Vibhu Anand", "Yash Sultania",
        "Yash Tandon"
      ],
      challenger: [
        "A V", "Aashish Chaube", "Abhijit Raja", "Abhishek Rania",
        "Abhishek Varma", "Adwait Wajpe", "Ajay Rachakonda", "Akshay Kulkarni",
        "Amitabh Gautam", "Anchit Singh", "Andy Swer", "Anil Singh",
        "Arjun Shaji", "Arpit Roy", "Ashley Braganza", "Ashrant Kohli",
        "Atif Hussain", "Chayan Mukhopadhyay", "Connel Coelho", "Danston Rodrigues",
        "Dennis Figueiredo", "Falak Shah", "Gaurav Jethwani", "Harsh Bubna",
        "Harsh Dattani", "Harshit Bhagat", "Heldon Dmello", "Himangshu Das",
        "Hrushikesh Pingale", "Ishaan Dass", "Joshua DCosta", "Karan Seth",
        "Kartik Manchanda", "Kartik Purohit", "Kaushal Bihani", "kushal Tiwari",
        "Kyros Almeida", "Malay Bhagat", "Manoj B", "Mrinal Choudhary",
        "Mukul Modi", "Nakul Moolji", "nihal shetty", "Nikunj Jain",
        "Pranav Krishna", "Raghav Khurana", "Raghav Sanghi", "Rishi Sharma",
        "Rohit Karna", "Shivam Singhal", "Sid Trivedi", "Siddhesh Owalekar",
        "Sumedh Pahwa", "ujjvall lulla", "Uzair Patankar", "Varun Narula",
        "Varun Shah", "Vasant rao", "Vishal Shah", "Yash Gawai",
        "Zaid Sheikh"
      ],
      conference: [
        "Aakash Subramanian", "Aayushi Sanghvi", "Abhimanyu Pathania", "Ahan Khanna",
        "Akshay Ramachandran", "Albert Malngiang", "Allan Crasto", "Aman Ghai",
        "AMAN RAJ", "Andrew solomon clement", "Aniket Mishra", "Ankit Kumar",
        "Darayus Bhathena", "Delwyn Serrao", "Dexter Dias", "Dhruv Shanghvi",
        "Dinesh Relwani", "Duane Pereira", "Durga Prasad Mishra", "Dwayne Fernandes",
        "EDWIN SNEHAM", "Glen Pinto", "Heramb Kinjawadekar", "Inderpreet Singh",
        "Ivaan Mehta", "Jenil Shah", "Jishnu Batabyal", "Joshua Alphonso",
        "KARAN SHARDA", "Karan Shivhare", "Kushagr Singh", "manan mehta",
        "MANAV SANGHVI", "Mayank Saraf", "Meet Doshi", "Mithun .",
        "Mohit Modi", "Mudit Kapoor", "Murari Sharma", "Nanik Samtani",
        "Nayant Parekh", "Niraj Jain", "Nishant Nagar", "Onkar Mistry",
        "Prakul Tyagi", "Prateek Khubchandani", "Raghav Kapoor", "Raghav Rastogi",
        "Rahul Mehta", "Rajeev Asija", "Rishabh Thakur", "Sags K",
        "Sahil Parekh", "sahil vijan", "Shivek Jindal", "Shraman Nakhat",
        "Siddharth Kewalramani", "Sunshine Khongwir", "V S", "Varghese John",
        "Yash Shah", "Zarna Patel"
      ]
    },
    },

    /* ---- Game On UCL (H2H) ----------------------------------------------- */
    h2h: {
      groupCount: 16,
      perGroup: 15,
      expectedManagers: 240,
      groupStageGws: range(1, 29),
      pointsWin: 3, pointsDraw: 1, pointsLoss: 0,
      qualify: { uclPerGroup: 2, uelPerGroup: 2 }, // top2 -> UCL, 3rd&4th -> UEL
      knockout: [
        { key: "r32", name: "Round of 32",   gws: [30, 31], legs: 2 },
        { key: "r16", name: "Round of 16",   gws: [32, 33], legs: 2 },
        { key: "qf",  name: "Quarter Finals", gws: [34, 35], legs: 2 },
        { key: "sf",  name: "Semi Finals",    gws: [36, 37], legs: 2 },
        { key: "final", name: "Final",        gws: [38],     legs: 1 }
      ],
      prizes: {
        ucl: { winner: 15000, runnerUp: 7500 },
        uel: { winner: 4000,  runnerUp: 1750 }
      }
    },

    /* ---- General rules (verbatim reference text) -------------------------- */
    rules: [
      { n: 1, title: "One team per manager",
        body: "Only one team per manager for all competitions." },
      { n: 2, title: "Classic league tie breakers",
        body: "Tie breakers settled with monthly wins between tied managers, else prize split as average of prize for the tied spots." },
      { n: 3, title: "LMS scoring",
        body: "LMS scores are for that GW alone, includes hits taken. Scores reset every week." },
      { n: 4, title: "LMS tie breaker rules",
        body: "1) Points on bench  2) More goals in playing XI  3) More clean sheets in playing XI  4) More assists in playing XI. If still a tie then tied managers carry forward to next GW and the tie is broken there in addition to the normal eliminations for that week." },
      { n: 5, title: "H2H (UCL) tie breakers",
        body: "UCL standings follow FPL league standings for the H2H league. Ties in knockout rounds follow LMS tie breaker rules. If still a tie, then higher points in group stage goes through, then higher score in group stage goes through." },
      { n: 6, title: "Pyramid rules",
        body: "Hits falling within the season will apply. If tie in pyramid, higher points in last GW of the mini season wins. If still tied then LMS tie breaker rules for the last GW apply." },
      { n: 7, title: "Monthly rules",
        body: "Monthly scores include hits in the GWs that apply for that month. In case of a tie, LMS tie breaker rules apply for the GWs applicable to that month." }
    ]
  };

  /* Build the LMS elimination-per-gameweek map from the published grid. */
  function buildLmsGrid() {
    var g = {};
    fill(g, 1, 12, 8);
    fill(g, 13, 22, 7);
    fill(g, 23, 26, 6);
    fill(g, 27, 33, 5);
    fill(g, 34, 37, 4);
    g[38] = 3;
    return g;
    function fill(obj, a, b, v) { for (var i = a; i <= b; i++) obj[i] = v; }
  }

  function range(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) out.push(i);
    return out;
  }

  window.GO_DEFAULT_CONFIG = CONFIG;
})();
