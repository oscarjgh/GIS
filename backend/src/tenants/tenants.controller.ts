import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { Roles } from '../common/auth-user';
import { Role, Tenant, User } from '../entities';

class CreateTenantDto {
  @IsString()
  name: string;

  @Matches(/^[a-z0-9-]{3,40}$/, { message: 'slug: solo minúsculas, números y guiones' })
  slug: string;

  /** Primer administrador de la empresa. */
  @IsString()
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @MinLength(6)
  adminPassword: string;
}

class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsObject() branding?: Record<string, unknown>;
}

/** Administración de empresas cliente: solo super administrador. */
@Controller('tenants')
@Roles(Role.SUPERADMIN)
export class TenantsController {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  list() {
    return this.tenants.find({ order: { name: 'ASC' } });
  }

  @Post()
  async create(@Body() dto: CreateTenantDto) {
    if (await this.tenants.findOneBy({ slug: dto.slug })) throw new ConflictException('El slug ya existe');
    return this.dataSource.transaction(async (m) => {
      if (await m.findOneBy(User, { email: dto.adminEmail.toLowerCase() })) {
        throw new ConflictException('El correo del administrador ya está registrado');
      }
      const tenant = await m.save(m.create(Tenant, { name: dto.name, slug: dto.slug }));
      await m.save(
        m.create(User, {
          tenantId: tenant.id,
          name: dto.adminName,
          email: dto.adminEmail.toLowerCase(),
          passwordHash: await bcrypt.hash(dto.adminPassword, 10),
          role: Role.ADMIN,
        }),
      );
      return tenant;
    });
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenants.findOneBy({ id });
    if (!tenant) throw new NotFoundException();
    Object.assign(tenant, dto);
    return this.tenants.save(tenant);
  }
}
