/**
 * Seed de desenvolvimento: cria a organização inicial e torna ADMIN o usuário
 * indicado em SEED_ADMIN_EMAIL (que precisa já ter se cadastrado no Supabase Auth).
 *
 *   SEED_ADMIN_EMAIL=voce@empresa.com SEED_ORG_NAME="IRB(Re)" npm run db:seed
 *
 * Não cria documentos nem dados fictícios.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const orgName = process.env.SEED_ORG_NAME ?? "Minha organização";
  if (!email) throw new Error("Defina SEED_ADMIN_EMAIL.");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Usuário ${email} não encontrado. Cadastre-o primeiro pelo login.`);

  const org = await prisma.organization.upsert({
    where: { slug: slugify(orgName) },
    update: {},
    create: { name: orgName, slug: slugify(orgName) },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { role: "ADMIN", active: true },
    create: { organizationId: org.id, userId: user.id, role: "ADMIN" },
  });

  console.log(`✔ ${email} é ADMIN de "${org.name}" (${org.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
