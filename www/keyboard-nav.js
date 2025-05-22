(function () {
  // Wait for the Shiny app to be fully loaded
  $(document).on("shiny:connected", function () {
    // Set up key event listener for the document
    $(document).on("keydown", function (e) {
      // Left arrow key (37) for previous image
      if (e.keyCode === 37) {
        // Only trigger if not in a text input
        if (!$(document.activeElement).is("input[type=text], textarea")) {
          $("#prev_img").click();
          e.preventDefault();
        }
      }
      // Right arrow key (39) for next image
      else if (e.keyCode === 39) {
        // Only trigger if not in a text input
        if (!$(document.activeElement).is("input[type=text], textarea")) {
          $("#next_img").click();
          e.preventDefault();
        }
      }
    });
  });
})();
