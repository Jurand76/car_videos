const photosBase = window.__AUTKA_PHOTOS_URL__ || "http://localhost:3010";

const photosNav = document.getElementById("photos-nav");
const photosCard = document.getElementById("photos-card");

if (photosNav) photosNav.href = `${photosBase}/dashboard`;
if (photosCard) photosCard.href = `${photosBase}/login`;
