import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Slug do workspace na URL. Hoje é fixo — a base ainda é de organização única. */
const ORG_SLUG = 'workspace';

/**
 * Manda a pessoa para o primeiro time dela; na falta de vínculo, para o
 * primeiro time do workspace. Antes isto era um caminho fixo (/lndev-ui/team/CORE),
 * que quebrava assim que o time CORE deixava de existir.
 */
export default async function Home() {
   const supabase = await createClient();

   const {
      data: { user },
   } = await supabase.auth.getUser();

   if (!user) redirect('/login');

   const { data: profile } = await supabase
      .from('profiles')
      .select('id, team_members(team_id)')
      .eq('user_id', user.id)
      .maybeSingle<{ id: string; team_members: { team_id: string }[] }>();

   let teamId = profile?.team_members?.[0]?.team_id;

   if (!teamId) {
      const { data: team } = await supabase
         .from('teams')
         .select('id')
         .order('name')
         .limit(1)
         .maybeSingle();
      teamId = team?.id;
   }

   if (!teamId) redirect(`/${ORG_SLUG}/teams`);

   redirect(`/${ORG_SLUG}/team/${teamId}/all`);
}
