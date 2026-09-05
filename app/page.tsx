import { cookies } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { currentUserFromCookie } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";
import { hasPublicBillFollows, listPublicBills, listPublicFilterOptions } from "#/server/public/queries";
import { buildFeedHref, parseFeedSearchParams } from "#/server/public/search-params";
import { FeedFilters } from "#/ui/feed-filters";
import { ProjectResults } from "#/ui/project-results";

export const dynamic = "force-dynamic";

const users = new UserRepository(db);

export default async function HomePage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const filters = parseFeedSearchParams(await searchParams);
  const optionsPromise = listPublicFilterOptions(db);
  const user = await currentUserFromCookie((await cookies()).toString(), users);
  if (filters.followedOnly && !user) {
    redirect(`/entrar?next=${encodeURIComponent(buildFeedHref(filters, filters.page ?? 1))}`);
  }
  let projects;
  let emptyFollowed = false;
  if (!filters.followedOnly) {
    projects = await listPublicBills(db, filters);
  } else {
    const [followedProjects, hasFollows] = await Promise.all([
      listPublicBills(db, filters, { userId: user!.id }),
      hasPublicBillFollows(db, user!.id),
    ]);
    projects = followedProjects;
    emptyFollowed = !hasFollows;
  }
  const options = await optionsPromise;

  return (
    <main id="conteudo" className="feedPage">
      <section className="feedIntro" aria-labelledby="feed-title">
        <div><span className="eyebrow">Câmara + Senado · dados oficiais</span><h1 id="feed-title">O que está mudando<br />em Brasília.</h1></div>
        <p>Projetos de lei em uma linguagem que dá para entender — com o caminho completo para você conferir cada informação.</p>
      </section>
      <FeedFilters authenticated={Boolean(user)} filters={filters} options={options} />
      <ProjectResults emptyFollowed={emptyFollowed} filters={filters} projects={projects!} />
    </main>
  );
}
