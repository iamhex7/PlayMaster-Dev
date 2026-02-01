/**
 * 内置示例游戏的结构化数据（供「走后门」跳过 AI 解析）
 */
export const SAMPLE_GAMES = {
  'neon-heist': {
    game_name: 'Neon Heist: The Core (霓虹劫案)',
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
