export const catalog = [
  {
    sport: { sport_id: 1, sport_name: "Soccer", sport_weight: 100 },
    categories: [
      { category_name: "England", country_id: "GB", category_weight: 50 },
      { category_name: "Spain", country_id: "ES", category_weight: 45 }
    ],
    tournaments: [
      { tournament_name: "Premier League", tournament_weight: 80 },
      { tournament_name: "La Liga", tournament_weight: 75 }
    ],
    participants: [
      "Lions", "Tigers", "Falcons", "Sharks", "Rangers", "City", "United", "Athletic", "Dynamos", "Wolves",
      "Royals", "Phoenix", "Storm", "Albion", "County", "Rovers", "Harriers", "Spartans", "Bulls", "Giants"
    ],
    marketTemplates: [
      {
        templateId: 1,
        name: "1X2",
        resultTypeId: 1,
        outcomes: [
          { name: "Home", outcomeTypeId: 1, participantIndex: 0 },
          { name: "Draw", outcomeTypeId: 2 },
          { name: "Away", outcomeTypeId: 3, participantIndex: 1 }
        ]
      },
      {
        templateId: 2,
        name: "Total Over/Under 2.5",
        resultTypeId: 2,
        outcomes: [
          { name: "Over 2.5", outcomeTypeId: 11 },
          { name: "Under 2.5", outcomeTypeId: 12 }
        ]
      },
      {
        templateId: 3,
        name: "Both Teams To Score",
        resultTypeId: 3,
        outcomes: [
          { name: "Yes", outcomeTypeId: 21 },
          { name: "No", outcomeTypeId: 22 }
        ]
      },
      {
        templateId: 4,
        name: "Double Chance",
        resultTypeId: 4,
        outcomes: [
          { name: "1X", outcomeTypeId: 31 },
          { name: "12", outcomeTypeId: 32 },
          { name: "X2", outcomeTypeId: 33 }
        ]
      }
    ]
  },
  {
    sport: { sport_id: 2, sport_name: "Basketball", sport_weight: 90 },
    categories: [
      { category_name: "USA", country_id: "US", category_weight: 60 },
      { category_name: "Europe", country_id: "EU", category_weight: 40 }
    ],
    tournaments: [
      { tournament_name: "Pro League", tournament_weight: 85 },
      { tournament_name: "Euro Cup", tournament_weight: 70 }
    ],
    participants: [
      "Comets", "Titans", "Rockets", "Spurs", "Knights", "Cyclones", "Raiders", "Pioneers", "Blaze", "Monarchs",
      "Jets", "Heat", "Sparks", "Wizards", "Legends", "Bears", "Eagles", "Celtics", "Stars", "Panthers"
    ],
    marketTemplates: [
      {
        templateId: 5,
        name: "Winner",
        resultTypeId: 5,
        outcomes: [
          { name: "Home", outcomeTypeId: 41, participantIndex: 0 },
          { name: "Away", outcomeTypeId: 42, participantIndex: 1 }
        ]
      },
      {
        templateId: 6,
        name: "Total Points O/U",
        resultTypeId: 6,
        outcomes: [
          { name: "Over 171.5", outcomeTypeId: 51 },
          { name: "Under 171.5", outcomeTypeId: 52 }
        ]
      },
      {
        templateId: 7,
        name: "Handicap",
        resultTypeId: 7,
        outcomes: [
          { name: "Home -4.5", outcomeTypeId: 61, participantIndex: 0 },
          { name: "Away +4.5", outcomeTypeId: 62, participantIndex: 1 }
        ]
      },
      {
        templateId: 8,
        name: "First Half Winner",
        resultTypeId: 8,
        outcomes: [
          { name: "Home", outcomeTypeId: 71, participantIndex: 0 },
          { name: "Away", outcomeTypeId: 72, participantIndex: 1 }
        ]
      }
    ]
  },
  {
    sport: { sport_id: 3, sport_name: "Tennis", sport_weight: 80 },
    categories: [
      { category_name: "ATP", country_id: "INT", category_weight: 55 },
      { category_name: "WTA", country_id: "INT", category_weight: 50 }
    ],
    tournaments: [
      { tournament_name: "Masters", tournament_weight: 90 },
      { tournament_name: "Open Series", tournament_weight: 78 }
    ],
    participants: [
      "Novak Vale", "Rafael Stone", "Carlos Hart", "Jannik Reed", "Dani Crest", "Alex Pike", "Mila North", "Iga Vale",
      "Aryna Frost", "Coco Hale", "Naomi Brook", "Emma Drew", "Paula Skye", "Lina West", "Marta Snow", "Jade Wynn",
      "Leah Cross", "Tara Bloom", "Nina Chase", "Sara Lane"
    ],
    marketTemplates: [
      {
        templateId: 9,
        name: "Winner",
        resultTypeId: 9,
        outcomes: [
          { name: "Player 1", outcomeTypeId: 81, participantIndex: 0 },
          { name: "Player 2", outcomeTypeId: 82, participantIndex: 1 }
        ]
      },
      {
        templateId: 10,
        name: "Set Winner",
        resultTypeId: 10,
        outcomes: [
          { name: "Player 1", outcomeTypeId: 91, participantIndex: 0 },
          { name: "Player 2", outcomeTypeId: 92, participantIndex: 1 }
        ]
      },
      {
        templateId: 11,
        name: "Total Games O/U",
        resultTypeId: 11,
        outcomes: [
          { name: "Over 22.5", outcomeTypeId: 101 },
          { name: "Under 22.5", outcomeTypeId: 102 }
        ]
      },
      {
        templateId: 12,
        name: "First Set Total Games O/U",
        resultTypeId: 12,
        outcomes: [
          { name: "Over 9.5", outcomeTypeId: 111 },
          { name: "Under 9.5", outcomeTypeId: 112 }
        ]
      }
    ]
  }
];
