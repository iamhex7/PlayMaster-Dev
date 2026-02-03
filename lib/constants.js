/**
 * 谁是卧底：预置词库（平民词 / 卧底词）
 */
export const AMONG_US_WORD_PAIRS = [
  { civilian: '胡萝卜', spy: '白萝卜' },
  { civilian: '玫瑰', spy: '月季' },
  { civilian: '包菜', spy: '生菜' },
  { civilian: '土豆', spy: '红薯' },
  { civilian: '橙子', spy: '橘子' },
  { civilian: '蝴蝶', spy: '飞蛾' },
  { civilian: '猴子', spy: '猩猩' },
  { civilian: '香皂', spy: '沐浴露' },
  { civilian: '辣椒', spy: '青椒' },
  { civilian: '牛奶', spy: '豆浆' },
  { civilian: '馒头', spy: '包子' },
  { civilian: '饺子', spy: '馄饨' },
  { civilian: '拖鞋', spy: '凉鞋' },
  { civilian: '手机', spy: '平板' },
  { civilian: '西瓜', spy: '冬瓜' }
]

/**
 * 内置示例游戏的结构化数据（供「走后门」跳过 AI 解析）
 */
export const SAMPLE_GAMES = {
  'among-us': {
    game_name: '谁是卧底',
    gameId: 'among-us',
    min_players: 4,
    max_players: 12,
    game_schema: {
      game_type: 'word_based',
      distribution: { type: 'words', word_generation: 'preset_pairs' },
      phase_interactions: [
        { phase_id: 'description', phase_name: '描述阶段', in_app_input: false, transition_trigger: 'host_confirm', transition_prompt: '描述结束，进入投票', transition_target: 'first_player' },
        { phase_id: 'voting', phase_name: '投票阶段', in_app_input: true, action_type: 'select', action_target: 'all_players', options_source: 'all_players', action_prompt: '投票选出你认为的卧底（单选题）' }
      ]
    },
    opening_speech: '欢迎来到「谁是卧底」。平民拿到相同词语，卧底拿到相近词语，白板则无词。通过描述找出同伴、揪出卧底；卧底则隐藏身份、伪装平民。平民找出所有卧底则平民胜；卧底坚持到最后且平民人数不超过卧底则卧底胜。祝各位好运！',
    phases: ['描述阶段：玩家轮流用一句话描述自己的词', '投票阶段：讨论后投票选出描述最不像大家的人', '出局阶段：得票最多者出局，检查胜负'],
    win_condition: '平民找出所有卧底则平民胜；卧底坚持到最后且场上平民人数 ≤ 卧底人数则卧底胜。',
    resources: '每人获得一个词语（平民/卧底）或白板（无词）。',
    role_distribution_rules: [
      { min: 4, max: 5, civilian: [3, 4], spy: 1, blank: 0 },
      { min: 6, max: 8, civilian: [4, 5, 6], spy: [1, 2], blank: [0, 1] },
      { min: 9, max: 12, civilian: [6, 7, 8, 9], spy: 2, blank: [0, 1] }
    ]
  },
  'neon-heist': {
    game_name: 'Neon Heist: The Core (霓虹劫案)',
    gameId: 'neon-heist',
    game_schema: {
      game_type: 'role_based',
      distribution: { type: 'roles', cards_per_player: 1 },
      phase_interactions: [
        { phase_id: 'infiltration', phase_name: '渗透阶段', in_app_input: true, action_type: 'confirm', action_target: 'current_player' },
        { phase_id: 'vault', phase_name: '核心金库', in_app_input: true, action_type: 'input', action_target: 'current_player' },
        { phase_id: 'extraction', phase_name: '撤离阶段', in_app_input: true, action_type: 'confirm', action_target: 'current_player' }
      ]
    },
    players_setup: '3-5名玩家，分为黑客、保镖和中间人。核心任务是窃取欧米茄核心并撤离。',
    resources: '每人初始拥有：1000 信用点、1 个神经链接、2 点行动力。',
    phases: [
      '渗透阶段：消耗行动力潜入安全网格。',
      '核心金库：破解 3 位数动态密码锁。',
      '撤离阶段：躲避安全无人机，在 5 回合内到达接应面包车。'
    ],
    win_condition: '团队成功提取核心并在 5 回合内到达接应点。',
    opening_speech: '（低沉的合成音）欢迎来到不夜城的阴影。今晚的目标是欧米茄核心。黑客、保镖、中间人，检查你们的神经链接。核心到手，大家下半辈子在沙滩度过；被抓到了，就等着被格式化。行动开始！',
    roles: [
      { name: '黑客 (Hacker)', count: 1, skill_summary: '无需消耗行动点即可绕过安全锁。' },
      { name: '保镖 (Bodyguard)', count: 1, skill_summary: '保护一名队友免受安全系统标记。' },
      { name: '中间人 (Fixer)', count: 1, skill_summary: '在策划阶段可以在任意两名玩家间进行物品交易。' },
      { name: '平民专家', count: 2, skill_summary: '协助潜入，提供额外的行动支援。' }
    ],
    cards_per_player: 1,
    initial_items: { credits: 1000, neural_link: 1, action_points: 2 },
    min_players: 3,
    max_players: 5
  }
}
