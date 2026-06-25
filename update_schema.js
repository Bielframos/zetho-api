const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'appwrite.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Find user_profiles table
const userProfilesTable = config.tables.find(t => t.$id === 'user_profiles');
if (userProfilesTable) {
  if (!userProfilesTable.columns.find(c => c.key === 'activeThemeId')) {
    userProfilesTable.columns.push({
      key: "activeThemeId",
      type: "string",
      required: false,
      array: false,
      size: 36,
      default: null
    });
  }

  if (!userProfilesTable.columns.find(c => c.key === 'unlockedThemes')) {
    userProfilesTable.columns.push({
      key: "unlockedThemes",
      type: "string",
      required: false,
      array: true,
      size: 255, // Using 255 to store a few theme IDs safely
      default: null
    });
  }
}

// Add profile_themes table
if (!config.tables.find(t => t.$id === 'profile_themes')) {
  config.tables.push({
    $id: "profile_themes",
    $permissions: [
      "read(\"any\")",
      "create(\"users\")",
      "update(\"users\")",
      "delete(\"users\")"
    ],
    databaseId: "app",
    name: "Profile Themes",
    enabled: true,
    rowSecurity: false,
    columns: [
      { key: "name", type: "string", required: true, array: false, size: 255, default: null },
      { key: "type", type: "string", required: true, array: false, size: 32, default: null },
      { key: "price", type: "integer", required: true, array: false, default: null },
      { key: "backgroundImageId", type: "string", required: false, array: false, size: 255, default: null },
      { key: "backgroundColor", type: "string", required: false, array: false, size: 32, default: null },
      { key: "primaryColor", type: "string", required: false, array: false, size: 32, default: null },
      { key: "secondaryColor", type: "string", required: false, array: false, size: 32, default: null },
      { key: "tertiaryColor", type: "string", required: false, array: false, size: 32, default: null },
      { key: "gameId", type: "string", required: false, array: false, size: 36, default: null }
    ],
    indexes: []
  });
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
console.log('Appwrite config updated successfully.');
