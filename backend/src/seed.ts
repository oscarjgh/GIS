import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { config } from './config';
import { Device, DeviceProtocol, ENTITIES, Role, Tenant, User, Vehicle } from './entities';

/**
 * Crea el super administrador y, si se pide con --demo, una empresa de prueba
 * con un vehículo, un GPS TK103 y usuarios de cada rol.
 */
async function main() {
  const ds = new DataSource({ type: 'postgres', url: config.databaseUrl, entities: ENTITIES, synchronize: config.dbSync });
  await ds.initialize();
  const users = ds.getRepository(User);

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@flota.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  if (!(await users.findOneBy({ email }))) {
    await users.save(users.create({ email, name: 'Super Admin', role: Role.SUPERADMIN, tenantId: null, passwordHash: await bcrypt.hash(password, 10) }));
    console.log(`Super administrador creado: ${email}`);
  }

  if (process.argv.includes('--demo')) {
    const tenants = ds.getRepository(Tenant);
    let tenant = await tenants.findOneBy({ slug: 'demo' });
    if (!tenant) {
      tenant = await tenants.save(tenants.create({ name: 'Transportes Demo', slug: 'demo' }));
      const hash = await bcrypt.hash('demo123', 10);
      await users.save([
        users.create({ tenantId: tenant.id, email: 'admin@demo.local', name: 'Admin Demo', role: Role.ADMIN, passwordHash: hash }),
        users.create({ tenantId: tenant.id, email: 'operador@demo.local', name: 'Operador Demo', role: Role.OPERATOR, passwordHash: hash }),
        users.create({ tenantId: tenant.id, email: 'chofer@demo.local', name: 'Chofer Demo', role: Role.DRIVER, passwordHash: hash }),
      ]);
      const vehicle = await ds.getRepository(Vehicle).save({ tenantId: tenant.id, name: 'Camioneta 01', plate: 'ABC-123-D', brand: 'Nissan', model: 'NP300', year: 2020, speedLimit: 90 });
      await ds.getRepository(Device).save({ tenantId: tenant.id, vehicleId: vehicle.id, uniqueId: '868683020235846', protocol: DeviceProtocol.TK103_COBAN, name: 'GPS TK103 demo' });
      console.log('Empresa demo creada (admin@demo.local / operador@demo.local / chofer@demo.local, contraseña demo123)');
    }
  }
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
