(function () {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/play/sw.js").catch((error) => {
      console.warn("Unable to register play app shell", error);
    });
  });
})();
