const fs = require('fs');
const path = require('path');

const typeFile = path.join(__dirname, 'src/infra/appwrite/appwrite.d.ts');
let content = fs.readFileSync(typeFile, 'utf8');

// Add ProfileThemes type
const themeType = `
export enum ProfileThemeType {
  COLOR = 'color',
  GAME = 'game',
}

export type ProfileThemes = Models.Row & {
  name: string;
  type: ProfileThemeType;
  price: number;
  backgroundImageId: string | null;
  backgroundColor: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  tertiaryColor: string | null;
  gameId: string | null;
};
`;

if (!content.includes('ProfileThemes')) {
  content += themeType;
}

// Modify UserProfiles
if (!content.includes('activeThemeId:')) {
  content = content.replace(
    /export type UserProfiles = Models\.Row & \{([^}]+)\};/m,
    (match, body) => {
      return `export type UserProfiles = Models.Row & {${body}  activeThemeId: string | null;\n  unlockedThemes: string[] | null;\n};`;
    }
  );
}

fs.writeFileSync(typeFile, content);
console.log('Types updated.');
