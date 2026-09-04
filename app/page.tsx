import { cookies } from "next/headers.js";

import { currentUserFromCookie } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";
import { listPublicBills, listPublicFilterOptions } from "#/server/public/queries";
import { parseFeedSearchParams } from "#/server/public/search-params";
import { FeedFilters } from "#/ui/feed-filters";
import { AnonymousFollowedResults } from "#/ui/anonymous-followed-results";
import { ProjectResults } from "#/ui/project-results";

export const dynamic = "force-dynamic";

const users = new UserRepository(db);

export default async function HomePage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const filters = parseFeedSearchParams(await searchParams);
  const optionsPromise = listPublicFilterOptions(db);
  let projects;
  let anonymousFollowed = false;
  if (!filters.followedOnly) {
    projects = await listPublicBills(db, filters);
  } else {
    const user = await currentUserFromCookie((await cookies()).toString(), users);
    if (user) projects = await listPublicBills(db, filters, { userId: user.id });
    else anonymousFollowed = true;
  }
  const options = await optionsPromise;

  return (
    <main id="conteudo" className="feedPage">
      <section className="feedIntro" aria-labelledby="feed-title">
        <div><span className="eyebrow">Câmara + Senado · dados oficiais</span><h1 id="feed-title">O que está mudando<br />em Brasília.</h1></div>
        <p>Projetos de lei em uma linguagem que dá para entender — com o caminho completo para você conferir cada informação.</p>
      </section>
      <FeedFilters filters={filters} options={options} />
      {anonymousFollowed
        ? <AnonymousFollowedResults filters={filters} />
        : <ProjectResults filters={filters} projects={projects!} />}
    </main>
  );
}
