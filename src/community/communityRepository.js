import { supabase } from './supabaseClient.js';

function requireClient() {
  if (!supabase) throw new Error('Community sharing is not configured. Set the Supabase environment variables and restart the app.');
  return supabase;
}

export async function listCommunityPublications({ search = '', category = '', location = '', publishedAfter = '' } = {}) {
  let query = requireClient()
    .from('community_publications_with_stats')
    .select('*')
    .eq('is_published', true)
    .order('published_on', { ascending: false })
    .limit(200);
  if (search.trim()) query = query.textSearch('search_document', search.trim(), { type: 'websearch', config: 'english' });
  if (category) query = query.eq('category', category);
  if (location.trim()) query = query.ilike('location', `%${location.trim()}%`);
  if (publishedAfter) query = query.gte('published_on', publishedAfter);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getMyPublications(userId) {
  const { data, error } = await requireClient()
    .from('community_publications_with_stats')
    .select('*')
    .eq('author_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function getPublicationForFile(userId, fileId) {
  const { data, error } = await requireClient()
    .from('community_publications')
    .select('*')
    .eq('author_id', userId)
    .eq('workspace_file_id', fileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function savePublication(userId, fileId, draft) {
  const { data, error } = await requireClient()
    .from('community_publications')
    .upsert({
      author_id: userId,
      workspace_file_id: fileId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      keywords: draft.keywords,
      location: draft.location.trim(),
      published_on: draft.published_on,
      document_content: draft.document_content,
      source_references: draft.source_references,
      author_name: draft.author_name.trim(),
      is_published: true,
    }, { onConflict: 'author_id,workspace_file_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setPublicationPublished(publicationId, isPublished) {
  const { data, error } = await requireClient()
    .from('community_publications')
    .update({ is_published: isPublished })
    .eq('id', publicationId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deletePublication(publicationId) {
  const { error } = await requireClient()
    .from('community_publications')
    .delete()
    .eq('id', publicationId);
  if (error) throw error;
}

export async function saveRating(publicationId, userId, rating) {
  const { error } = await requireClient()
    .from('community_ratings')
    .upsert({
      publication_id: publicationId,
      user_id: userId,
      rating,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'publication_id,user_id' });
  if (error) throw error;
}

export async function reportPublication(publicationId, userId, reportType, details) {
  const { error } = await requireClient()
    .from('community_reports')
    .insert({
      publication_id: publicationId,
      reporter_id: userId,
      report_type: reportType,
      details: details.trim(),
    });
  if (error) throw error;
}

export async function getMyRating(publicationId, userId) {
  const { data, error } = await requireClient()
    .from('community_ratings')
    .select('rating')
    .eq('publication_id', publicationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.rating ?? 0;
}

export async function checkCommunityModerator() {
  const { data, error } = await requireClient().rpc('is_community_moderator');
  if (error) throw error;
  return Boolean(data);
}

export async function getPublicationReports() {
  const { data, error } = await requireClient()
    .from('community_reports')
    .select('*, community_publications(id, title, author_name, is_published)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function updateReportStatus(reportId, status) {
  const { error } = await requireClient()
    .from('community_reports')
    .update({ status })
    .eq('id', reportId);
  if (error) throw error;
}
