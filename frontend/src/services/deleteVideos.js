// Deletes each video independently so one failure does not stop the rest.
// A 404 means the video is already gone, which is the goal.
export async function deleteVideos(videos, remove) {
  const failed = [];
  let error = null;
  for (const video of videos) {
    try {
      await remove(video.id);
    } catch (err) {
      if (err.status === 404) continue;
      failed.push(video);
      error = err;
    }
  }
  return { deleted: videos.length - failed.length, failed, error };
}
