async function getOrCreateDmConversation(friendId) {
  if (dmConversationCache[friendId]) return dmConversationCache[friendId];

  const { data, error } = await supabaseClient
    .rpc('get_or_create_dm', { friend_id: friendId });

  if (error) {
    console.error('getOrCreateDmConversation:', error);
    showToast('Erreur création conversation : ' + error.message, 'error');
    return null;
  }

  dmConversationCache[friendId] = data;
  myConversationIds.add(data);
  return data;
}
