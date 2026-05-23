export interface OAuthUserDto {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  provider: 'google' | 'microsoft';
  accessToken?: string;
}

