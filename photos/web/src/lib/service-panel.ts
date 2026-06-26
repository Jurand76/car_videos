export const getServicePanelUrl = (accessToken: string) =>
  `/service?token=${encodeURIComponent(accessToken)}`;
