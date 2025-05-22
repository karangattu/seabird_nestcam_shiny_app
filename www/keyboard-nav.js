(function () {
  // Wait for the Shiny app to be fully loaded
  $(document).on("shiny:connected", function () {
    // Set up key event listener for the document
    $(document).on("keydown", function (e) {
      // Only trigger if not in a text input
      if ($(document.activeElement).is("input[type=text], textarea, select")) {
        return;
      }
      
      // Left arrow key (37) for previous image
      if (e.keyCode === 37) {
        $("#prev_img").click();
        e.preventDefault();
      }
      // Right arrow key (39) for next image
      else if (e.keyCode === 39) {
        $("#next_img").click();
        e.preventDefault();
      }
      // 'S' key (83) for marking sequence start
      else if (e.keyCode === 83) {
        // Toggle the mark_start checkbox
        const markStartCheckbox = $("#mark_start");
        markStartCheckbox.prop("checked", !markStartCheckbox.prop("checked"));
        markStartCheckbox.trigger("change");
        e.preventDefault();
      }
      // 'E' key (69) for marking sequence end
      else if (e.keyCode === 69) {
        // Toggle the mark_end checkbox
        const markEndCheckbox = $("#mark_end");
        markEndCheckbox.prop("checked", !markEndCheckbox.prop("checked"));
        markEndCheckbox.trigger("change");
        e.preventDefault();
      }
      // 'I' key (73) for single image observation
      else if (e.keyCode === 73) {
        // Toggle the single_image checkbox
        const singleImageCheckbox = $("#single_image");
        singleImageCheckbox.prop("checked", !singleImageCheckbox.prop("checked"));
        singleImageCheckbox.trigger("change");
        e.preventDefault();
      }
    });
  });
})();
