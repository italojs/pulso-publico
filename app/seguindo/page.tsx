import { cookies } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { currentUserFromCookie } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";
import { FollowingPage } from "#/ui/following-page";

export const dynamic = "force-dynamic";

const users = new UserRepository(db);

export default async function FollowedPage() {
  const user = await currentUserFromCookie((await cookies()).toString(), users);
  if (!user) redirect("/entrar?next=%2Fseguindo");
  return <main id="conteudo" className="collectionPage"><header className="collectionHero"><span className="eyebrow">Seu acompanhamento</span><h1>Seguindo</h1><p>Projetos, parlamentares e candidatos que você escolheu acompanhar. Sem algoritmo escolhendo por você.</p></header><FollowingPage /></main>;
}
