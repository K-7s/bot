function ownerIds() {
  return String(process.env.OWNER_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function isOwner(userId) {
  return ownerIds().includes(String(userId));
}

/** Gate for every panel interaction — only OWNER_IDS can touch the tool at all. */
async function guardInteraction(interaction) {
  if (isOwner(interaction.user.id)) return true;
  const msg = { content: 'الأمر ده متاح للـ Owner بس.', ephemeral: true };
  if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => null);
  else await interaction.reply(msg).catch(() => null);
  return false;
}

/**
 * Extra gate specific to the Reaction Manager: the owner must also actually manage
 * the target guild (Manage Server permission) before an auto-reaction rule can be
 * created there — enforces "servers I own or administrate only".
 */
async function assertManagesGuild(interaction) {
  if (!interaction.guild) throw new Error('الأمر لازم يتنفذ جوه سيرفر (مش دي إم).');
  const member = interaction.member;
  if (!member?.permissions?.has('ManageGuild')) {
    throw new Error('لازم يكون عندك صلاحية Manage Server في السيرفر ده عشان تضيف Auto Reaction فيه.');
  }
  return true;
}

module.exports = { ownerIds, isOwner, guardInteraction, assertManagesGuild };
