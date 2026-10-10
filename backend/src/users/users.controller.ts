import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser, CurrentUser, resolveTenant, Roles, tenantFilter } from '../common/auth-user';
import { Role, User } from '../entities';

class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @MinLength(6) password: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsUUID() tenantId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @MinLength(6) password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('tenantId') tenantId?: string) {
    const t = tenantFilter(user, tenantId);
    return this.users.find({ where: t ? { tenantId: t } : {}, order: { name: 'ASC' } });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    if (dto.role === Role.SUPERADMIN) throw new ForbiddenException('No se pueden crear super administradores aquí');
    const tenantId = resolveTenant(user, dto.tenantId);
    const email = dto.email.toLowerCase();
    if (await this.users.findOneBy({ email })) throw new ConflictException('El correo ya está registrado');
    const saved = await this.users.save(
      this.users.create({
        tenantId,
        name: dto.name,
        email,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, 10),
      }),
    );
    const { passwordHash: _, ...rest } = saved;
    return rest;
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    const t = tenantFilter(user);
    const target = await this.users.findOneBy(t ? { id, tenantId: t } : { id });
    if (!target) throw new NotFoundException();
    if (dto.role === Role.SUPERADMIN || target.role === Role.SUPERADMIN) throw new ForbiddenException();
    if (dto.name !== undefined) target.name = dto.name;
    if (dto.role !== undefined) target.role = dto.role;
    if (dto.active !== undefined) target.active = dto.active;
    if (dto.password) target.passwordHash = await bcrypt.hash(dto.password, 10);
    const { passwordHash: _, ...rest } = await this.users.save(target);
    return rest;
  }
}
