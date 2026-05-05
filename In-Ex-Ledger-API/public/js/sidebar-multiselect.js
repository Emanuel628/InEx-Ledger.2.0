/* Quick Add multi-select UX
   Keeps the sidebar Add library open while users add multiple shortcuts.
   The library only closes when the user clicks the Done button.
*/
(function () {
  const OPEN_STATE = "true";

  function getSidebarFromNode(node) {
    return node?.closest?.(".app-sidebar--dynamic") || document.querySelector(".app-sidebar--dynamic");
  }

  function getLibrary(sidebar) {
    return sidebar?.querySelector?.("[data-sidebar-library]") || null;
  }

  function getManageButton(sidebar) {
    return sidebar?.querySelector?.("[data-sidebar-manage]") || null;
  }

  function openLibrary(sidebar) {
    const library = getLibrary(sidebar);
    const manageButton = getManageButton(sidebar);
    if (!sidebar || !library || !manageButton) return;

    sidebar.dataset.sidebarLibraryOpen = OPEN_STATE;
    library.hidden = false;
    manageButton.setAttribute("aria-expanded", "true");
    manageButton.textContent = "Done";
  }

  function closeLibrary(sidebar) {
    const library = getLibrary(sidebar);
    const manageButton = getManageButton(sidebar);
    if (!sidebar || !library || !manageButton) return;

    delete sidebar.dataset.sidebarLibraryOpen;
    library.hidden = true;
    manageButton.setAttribute("aria-expanded", "false");
    manageButton.textContent = "Add";
  }

  function restoreOpenLibrary(sidebar) {
    if (!sidebar || sidebar.dataset.sidebarLibraryOpen !== OPEN_STATE) return;
    openLibrary(sidebar);
  }

  function observeSidebar(sidebar) {
    if (!sidebar || sidebar.dataset.sidebarMultiSelectObserved === "true") return;
    sidebar.dataset.sidebarMultiSelectObserved = "true";

    const observer = new MutationObserver(() => {
      restoreOpenLibrary(sidebar);
    });

    observer.observe(sidebar, {
      childList: true,
      subtree: true
    });
  }

  function observeExistingSidebars() {
    document.querySelectorAll(".app-sidebar--dynamic").forEach(observeSidebar);
  }

  document.addEventListener("click", (event) => {
    const manageButton = event.target.closest?.("[data-sidebar-manage]");
    const addButton = event.target.closest?.("[data-sidebar-add]");

    if (!manageButton && !addButton) return;

    const sidebar = getSidebarFromNode(event.target);
    if (!sidebar) return;

    if (manageButton) {
      window.requestAnimationFrame(() => {
        const isOpen = manageButton.getAttribute("aria-expanded") === "true";
        if (isOpen) {
          openLibrary(sidebar);
        } else {
          closeLibrary(sidebar);
        }
      });
      return;
    }

    if (addButton) {
      sidebar.dataset.sidebarLibraryOpen = OPEN_STATE;
      window.requestAnimationFrame(() => openLibrary(sidebar));
    }
  });

  const rootObserver = new MutationObserver(observeExistingSidebars);
  rootObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeExistingSidebars, { once: true });
  } else {
    observeExistingSidebars();
  }
})();
