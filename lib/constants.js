/**
 * Undercover: Preset word pairs (civilian word / spy word)
 */
export const AMONG_US_WORD_PAIRS = [
  { civilian: 'Carrot', spy: 'Parsnip' },
  { civilian: 'Rose', spy: 'Carnation' },
  { civilian: 'Cabbage', spy: 'Lettuce' },
  { civilian: 'Potato', spy: 'Sweet potato' },
  { civilian: 'Orange', spy: 'Tangerine' },
  { civilian: 'Butterfly', spy: 'Moth' },
  { civilian: 'Monkey', spy: 'Ape' },
  { civilian: 'Soap', spy: 'Shower gel' },
  { civilian: 'Pepper', spy: 'Bell pepper' },
  { civilian: 'Milk', spy: 'Soy milk' },
  { civilian: 'Bun', spy: 'Dumpling' },
  { civilian: 'Dumpling', spy: 'Wonton' },
  { civilian: 'Slippers', spy: 'Sandals' },
  { civilian: 'Phone', spy: 'Tablet' },
  { civilian: 'Watermelon', spy: 'Winter melon' }
]

/**
 * Built-in sample games (bypass AI parsing)
 */
export const SAMPLE_GAMES = {
  'among-us': {
    game_name: 'Undercover',
    gameId: 'among-us',
    min_players: 4,
    max_players: 12,
    game_schema: {
      game_type: 'word_based',
      distribution: { type: 'words', word_generation: 'preset_pairs' },
      phase_interactions: [
        { phase_id: 'description', phase_name: 'Description Phase', in_app_input: false, transition_trigger: 'host_confirm', transition_prompt: 'End description, enter voting', transition_target: 'first_player' },
        { phase_id: 'voting', phase_name: 'Voting Phase', in_app_input: true, action_type: 'select', action_target: 'all_players', options_source: 'all_players', action_prompt: 'Vote for who you think is the spy (single choice)' }
      ],
      win_conditions: [{ type: 'role_elimination', params: { civilians: 'civilian', spies: 'spy' } }]
    },
    opening_speech: 'Welcome to Undercover. Civilians get the same word, spies get a similar word, blanks get no word. Describe to find allies and spot the spy; spies hide and blend in. Civilians win by eliminating all spies; spies win by surviving until civilians ≤ spies. Good luck!',
    phases: ['Description: Players take turns describing their word in one sentence', 'Voting: After discussion, vote for who seems most unlike the group', 'Elimination: Most votes is out, check win condition'],
    win_condition: 'Civilians win by eliminating all spies; spies win by surviving until civilians ≤ spies.',
    resources: 'Each player gets one word (civilian/spy) or blank (no word).',
    role_distribution_rules: [
      { min: 4, max: 5, civilian: [3, 4], spy: 1, blank: 0 },
      { min: 6, max: 8, civilian: [4, 5, 6], spy: [1, 2], blank: [0, 1] },
      { min: 9, max: 12, civilian: [6, 7, 8, 9], spy: 2, blank: [0, 1] }
    ]
  },
  'texas-holdem': {
    game_name: 'Texas Hold\'em',
    gameId: 'texas-holdem',
    min_players: 1,
    max_players: 10,
    cards_per_player: 2,
    game_schema: {
      game_type: 'card_based',
      distribution: {
        type: 'cards',
        deck_type: 'standard_52',
        cards_per_player: 2
      },
      phase_interactions: [
        { phase_id: 'pre_flop', phase_name: 'Pre-flop Betting', in_app_input: true, action_type: 'select', action_target: 'current_player', action_options: ['Fold', 'Check', 'Call', 'Raise'] },
        { phase_id: 'flop', phase_name: 'Flop', deal_from_deck: 3 },
        { phase_id: 'turn', phase_name: 'Turn', deal_from_deck: 1 },
        { phase_id: 'river', phase_name: 'River', deal_from_deck: 1 },
        { phase_id: 'showdown', phase_name: 'Showdown' }
      ],
      win_conditions: [
        { type: 'last_standing', params: {} },
        { type: 'hand_compare', params: {} }
      ]
    },
    initial_items: { chips: 500 },
    small_blind: 10,
    big_blind: 20,
    opening_speech: 'Welcome to Texas Hold\'em. Each player gets 2 hole cards. Build the best 5-card hand with the flop, turn, and river. Good luck!',
    phases: [
      'Blinds: Player 1 is small blind, Player 2 is big blind; single player defaults to small blind',
      'Deal: 2 hole cards each',
      'First betting round: Call, raise, or fold',
      'Flop: Reveal 3 community cards',
      'Second betting round',
      'Turn: Reveal 4th community card',
      'Third betting round',
      'River: Reveal 5th community card',
      'Final betting round',
      'Showdown: Best 5-card hand wins'
    ],
    win_condition: 'Combine your 2 hole cards with 5 community cards for the best hand. Rankings: Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card.',
    resources: 'Each player gets 500 chips. Small blind 10, big blind 20.'
  },
  'neon-heist': {
    game_name: 'Neon Heist: The Core',
    gameId: 'neon-heist',
    game_schema: {
      game_type: 'role_based',
      distribution: { type: 'roles', cards_per_player: 1 },
      phase_interactions: [
        { phase_id: 'infiltration', phase_name: 'Infiltration Phase', in_app_input: true, action_type: 'confirm', action_target: 'current_player' },
        { phase_id: 'vault', phase_name: 'Core Vault', in_app_input: true, action_type: 'input', action_target: 'current_player' },
        { phase_id: 'extraction', phase_name: 'Extraction Phase', in_app_input: true, action_type: 'confirm', action_target: 'current_player' }
      ]
    },
    players_setup: '3-5 players: Hacker, Bodyguard, Fixer. Mission: steal the Omega Core and extract.',
    resources: 'Each player starts with: 1000 credits, 1 neural link, 2 action points.',
    phases: [
      'Infiltration: Spend action points to breach the security grid.',
      'Core Vault: Crack the 3-digit dynamic code lock.',
      'Extraction: Evade security drones, reach the pickup van within 5 turns.'
    ],
    win_condition: 'Team successfully extracts the core and reaches the pickup point within 5 turns.',
    opening_speech: '(Deep synth voice) Welcome to the shadows of the city. Tonight\'s target: the Omega Core. Hackers, bodyguards, fixers—check your neural links. Get the core, retire to the beach; get caught, expect a full wipe. Move out!',
    roles: [
      { name: 'Hacker', count: 1, skill_summary: 'Bypass security locks without spending action points.' },
      { name: 'Bodyguard', count: 1, skill_summary: 'Protect one teammate from security system tagging.' },
      { name: 'Fixer', count: 1, skill_summary: 'Trade items between any two players during planning phase.' },
      { name: 'Civilian Specialist', count: 2, skill_summary: 'Assist infiltration with extra action support.' }
    ],
    cards_per_player: 1,
    initial_items: { credits: 1000, neural_link: 1, action_points: 2 },
    min_players: 3,
    max_players: 5
  }
}
