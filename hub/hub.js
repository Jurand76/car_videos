// Na produkcji wszystko jest pod jedną domeną — linki relatywne działają wszędzie.
// hub.js tylko upewnia się, że /dashboard i /login wskazują na ten sam origin (web).
const photosNav = document.getElementById("photos-nav");
const photosCard = document.getElementById("photos-card");

if (photosNav && !photosNav.getAttribute("href")) photosNav.setAttribute("href", "/dashboard");
if (photosCard && !photosCard.getAttribute("href")) photosCard.setAttribute("href", "/dashboard");
