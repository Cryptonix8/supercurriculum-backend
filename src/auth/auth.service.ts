import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  /**
   * Validate user credentials
   */
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return null;
    }

    // Remove password from returned user object
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    
    if (existingUser) {
      throw new UnauthorizedException('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create user
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    // Remove password from response
    const { password: _, ...result } = user;

    // Generate token
    const token = this.generateToken(user);

    return {
      user: result,
      access_token: token,
    };
  }

  /**
   * Login user
   */
  async login(user: any) {
    const token = this.generateToken(user);

    return {
      user,
      access_token: token,
    };
  }

  /**
   * Mobile app login - students only
   * Teachers and admins should use the admin panel/web app
   */
  async mobileLogin(email: string, password: string) {
    const user = await this.validateUser(email, password);
    
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only allow students to login via mobile app
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException(
        'Mobile app is for students only. Teachers and administrators should use the web admin panel.'
      );
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated. Please contact your school administrator.');
    }

    return this.login(user);
  }

  /**
   * Generate JWT token
   */
  private generateToken(user: any): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * OAuth login (Google, Microsoft, etc.)
   */
  async oauthLogin(oauthUser: any) {
    let user = await this.usersService.findByEmail(oauthUser.email);

    if (!user) {
      // Create new user from OAuth data
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const newUser = await this.usersService.create({
        email: oauthUser.email,
        firstName: oauthUser.firstName,
        lastName: oauthUser.lastName,
        password: hashedPassword, // Random password for OAuth users
      });

      // Get the full user with profile
      user = await this.usersService.findByEmail(newUser.email);
    }

    return this.login(user);
  }

  /**
   * Forgot password - send reset token
   */
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Don't reveal if email exists
      return {
        message: 'If that email exists, a password reset link has been sent.',
      };
    }

    // Generate reset token (would normally save to database)
    const resetToken = Math.random().toString(36).substring(2, 15);

    // TODO: Send email with reset link
    // In production, implement email service
    console.log(`Password reset token for ${email}: ${resetToken}`);

    return {
      message: 'If that email exists, a password reset link has been sent.',
      // For development only - remove in production:
      _dev_token: resetToken,
    };
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    // TODO: Verify token from database
    // For now, this is a placeholder implementation

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // In production: Update user password where resetToken = token

    return {
      message: 'Password reset successful',
    };
  }
}

