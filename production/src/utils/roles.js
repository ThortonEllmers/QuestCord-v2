const { db } = require('./store_sqlite');

const DEV = (process.env.DEV_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const STAFF = (process.env.STAFF_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const PREMIUM = (process.env.PREMIUM_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const ROLE_GUILD_ID = process.env.ROLE_GUILD_ID;

async function fetchMember(client, userId){
  try{
    const gid = ROLE_GUILD_ID;
    if (!gid) return null;
    const g = await client.guilds.fetch(gid);
    return await g.members.fetch(userId);
  }catch{ return null; }
}

async function accessFromRoles(client, userId){
  const m = await fetchMember(client, userId);
  const rs = m ? m.roles.cache.map(r=>r.id) : [];
  if (DEV.some(id=>rs.includes(id))) return 'Developer';
  if (STAFF.some(id=>rs.includes(id))) return 'Staff';
  // Premium via role or DB fallback
  if (PREMIUM.some(id=>rs.includes(id))) return 'Premium';
  const row = db.prepare('SELECT 1 FROM premium_users WHERE userId=?').get(userId);
  if (row) return 'Premium';
  return 'User';
}

// New function to get role level as a number for hierarchy
async function getRoleLevel(client, userId){
  const m = await fetchMember(client, userId);
  const rs = m ? m.roles.cache.map(r=>r.id) : [];
  if (DEV.some(id=>rs.includes(id))) return 4; // Developer
  if (STAFF.some(id=>rs.includes(id))) return 3; // Staff
  if (PREMIUM.some(id=>rs.includes(id))) return 2; // Premium (role)
  const row = db.prepare('SELECT 1 FROM premium_users WHERE userId=?').get(userId);
  if (row) return 2; // Premium (database)
  return 1; // User
}

async function tag(client, userId){
  const lvl = await accessFromRoles(client, userId);
  return `[${lvl}]`;
}

async function getUserPrefix(client, user){
  const roleTag = await tag(client, user.id);
  return `${roleTag} ${user.username}`;
}
// Hierarchical permission functions - higher roles inherit lower role permissions
async function isDev(client, userId){ 
  const level = await getRoleLevel(client, userId);
  return level >= 4; // Developer level or higher
}

async function isStaffOrDev(client, userId){ 
  const level = await getRoleLevel(client, userId);
  return level >= 3; // Staff level or higher (includes Developer)
}

async function isPremium(client, userId){ 
  const level = await getRoleLevel(client, userId);
  return level >= 2; // Premium level or higher (includes Staff and Developer)
}

// Additional helper functions for checking specific minimum role levels
async function hasUserPerms(client, userId){
  const level = await getRoleLevel(client, userId);
  return level >= 1; // Everyone has user perms
}

module.exports = { 
  accessFromRoles, 
  getRoleLevel,
  tag, 
  getUserPrefix,
  isDev, 
  isStaffOrDev, 
  isPremium,
  hasUserPerms
};
