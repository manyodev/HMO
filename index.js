const SUPABASE_URL = "https://oxllmfeqwlxnacsarrgu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94bGxtZmVxd2x4bmFjc2Fycmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMzk2MTQsImV4cCI6MjEwNzkxNTYxNH0.ZU3FVUdx0yiIQiNX6BgKROAFuzT_wEPyF-Uqb5LMwRE";

// Load the Supabase browser library if the page has not loaded it yet.
function loadSupabaseLibrary() {
  if (window.supabase?.createClient) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = () => {
      if (window.supabase?.createClient) resolve();
      else reject(new Error("Supabase library does not expose createClient."));
    };
    script.onerror = () =>
      reject(new Error("Failed to load the Supabase library."));
    document.head.appendChild(script);
  });
}

async function initializeApp() {
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }

  try {
    await loadSupabaseLibrary();
  } catch (error) {
    console.error(error);
    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
  const feedContainer = document.getElementById("approved-feed");
  const forumForm = document.getElementById("forumForm");
  const statusMsg = document.getElementById("statusMsg");
  const submitBtn = forumForm?.querySelector('button[type="submit"]');

  async function fetchApprovedPosts() {
    if (!feedContainer) return;

    const { data, error } = await supabaseClient
      .from("posts")
      .select("*")
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) {
      feedContainer.innerHTML = `<p style="color:red">Error loading posts.</p>`;
      console.error(error);
      return;
    }

    if (data.length === 0) {
      feedContainer.innerHTML = "<p>No posts visible yet.</p>";
      return;
    }

    feedContainer.innerHTML = data
      .map(
        (post) => `
                <div class="post">
                <div class="image-box">
                    ${post.image_url ? `<img src="${escapeHTML(post.image_url)}" alt="User upload">` : ""}
                    </div>
                    <div class="post-content">
                    <strong>👤 ${escapeHTML(post.username)}</strong>
                    <small style="color:#777;">• ${new Date(post.created_at).toLocaleDateString()}</small>
                    <p>${escapeHTML(post.content)}</p>
                    </div>
                </div>
            `,
      )
      .join("");
  }

  if (forumForm) {
    forumForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        if (!submitBtn) throw new Error("Submit button was not found.");

        submitBtn.disabled = true;
        submitBtn.innerText = "Uploading files...";

        const username = document.getElementById("authorName").value.trim();
        const content = document.getElementById("postContent").value.trim();
        const fileInput = document.getElementById("imageFile");
        const file = fileInput.files[0];

        if (!file) throw new Error("Please choose an image to upload.");

        // 1. Generate a completely unique file name to prevent collision overwrites
        const fileExtension = file.name.split(".").pop();
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;

        // 2. Upload the file binary array straight into Supabase Bucket
        const { error: storageError } = await supabaseClient.storage
          .from("user-images")
          .upload(uniqueFileName, file);

        if (storageError) throw storageError;

        // 3. Resolve the public downloadable address string for that file
        const { data: urlData } = supabaseClient.storage
          .from("user-images")
          .getPublicUrl(uniqueFileName);

        const publicImageUrl = urlData.publicUrl;

        // 4. Save text structure + image link into the database rows
        const { error: dbError } = await supabaseClient
          .from("posts")
          .insert([{ username, content, image_url: publicImageUrl }]);

        if (dbError) throw dbError;

        // Success
        forumForm.reset();
        statusMsg.hidden = false;
        setTimeout(() => {
          statusMsg.hidden = true;
        }, 5000);
      } catch (err) {
        alert("An error occurred during submission.");
        console.error(err);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = "Submit for Review";
        }
      }
    });
  }

  if (feedContainer) fetchApprovedPosts();
}

// Helper to prevent basic XSS script injection
function escapeHTML(str) {
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        tag
      ] || tag,
  );
}

initializeApp();
