export const getVideoPanelUrl = (accessToken: string) =>
  `/video?token=${encodeURIComponent(accessToken)}`;
