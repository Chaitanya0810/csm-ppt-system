function parseProjectTeam(category, raw, roll, roster) {
  if (category !== 'Project') return null;
  const invalid = () => Object.assign(new Error('Select a team of 3 or 4 members with a different valid roll number for each teammate.'), { statusCode: 400 });
  let team;
  try { team = JSON.parse(raw); } catch { throw invalid(); }
  if (!team || ![3, 4].includes(team.size) || !Array.isArray(team.members) || team.members.length !== team.size - 1) throw invalid();
  if (team.members.some(value => typeof value !== 'string' || !roster.includes(value)) || new Set([roll, ...team.members]).size !== team.size) throw invalid();
  return { size: team.size, members: [roll, ...team.members] };
}
module.exports = { parseProjectTeam };
