const {dbQueryOne, updateCategoryMessage} = require('../lib');

// Delete DB entries if role messages are deleted
module.exports = async (client, deletedRole) => {
  let sql = `SELECT r.id, rc.messageId
             FROM roles r
             JOIN role_categories rc ON r.categoryId = rc.id
             JOIN role_systems rs ON rc.roleSystemId = rs.id
             JOIN guild_data gd ON rs.guildDataId = gd.id
             WHERE r.roleId=?
                AND gd.guildId=?`;
  const roleData = await dbQueryOne(sql, [deletedRole.id, deletedRole.guild.id]);
  if (roleData) {
    await dbQueryOne('DELETE FROM roles WHERE id=?', [roleData.id]);
    const guild = await deletedRole.guild.fetch();
    await updateCategoryMessage(client, guild, roleData.messageId);
  }
};
