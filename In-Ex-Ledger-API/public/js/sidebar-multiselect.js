/* Quick Add multi-select UX
   Keeps the sidebar Add library open while users add multiple shortcuts.
   The library only closes when the user clicks the Done button.

   Important: do not observe/rewrite the dynamic sidebar render cycle. global.js
   owns the sidebar markup and re-renders it after each add/remove. This file
   only preserves the user's open/closed intent after those renders complete.
*/
(function () {
  let shouldKeepLibraryOpen = false;

  function getSidebar() {
    return document.querySelector(".app-sidebar--dynamic");
  }

  function getLibrary(sidebar) {
    return sidebar?.querySelector?.("[data-sidebar-library]") || null;
  }

  function getManageButton(sidebar) {
    return sidebar?.querySelector?.("[data-sidebar-manage]") || null;
  }

  function openLibrary() {
    const sidebar = getSidebar();
    const library = getLibrary(sidebar);
    const manageButton = getManageButton(sidebar);
    if (!sidebar || !library || !manageButton) return;

    library.hidden = false;
    manageButton.setAttribute("aria-expanded", "true");
    manageButton.textContent = "Done";
  }

  function closeLibrary() {
    const sidebar = getSidebar();
    const library = getLibrary(sidebar);
    const manageButton = getManageButton(sidebar);
    if (!sidebar || !library || !manageButton) return;

    library.hidden = true;
    manageButton.setAttribute("aria-expanded", "false");
    manageButton.textContent = "Add";
  }

  function restoreOpenStateAfterRender() {
    if (!shouldKeepLibraryOpen) return;

    // global.js may re-render the sidebar immediately after the click handler.
    // Run after the current event and again on the next frame so the new markup
    // is present before we reopen the library.
    window.setTimeout(openLibrary, 0);
    window.requestAnimationFrame(openLibrary);
  }

  document.addEventListener("click", (event) => {
    const manageButton = event.target.closest?.("[data-sidebar-manage]");
    const addButton = event.target.closest?.("[data-sidebar-add]");

    if (!manageButton && !addButton) return;

    if (addButton) {
      shouldKeepLibraryOpen = true;
      restoreOpenStateAfterRender();
      return;
    }

    // Add/Done button: let global.js toggle first, then mirror that final state.
    window.requestAnimationFrame(() => {
      const currentManageButton = getManageButton(getSidebar());
      const isOpen = currentManageButton?.getAttribute("aria-expanded") === "true";

      shouldKeepLibraryOpen = Boolean(isOpen);
      if (shouldKeepLibraryOpen) {
        openLibrary();
      } else {
        closeLibrary();
      }
    });
  });
})();
