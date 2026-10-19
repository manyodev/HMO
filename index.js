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
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    },
  );
  const feedContainer = document.getElementById("approved-feed");
  const forumForm = document.getElementById("forumForm");
  const postStatusMsg = document.getElementById("statusMsg");
  const submitBtn = document.getElementById("submit-btn");
  const signupForm = document.getElementById("signup-form");
  const signupStatusMsg = document.getElementById("statusMsg2");
  const signupSubmitBtn = document.getElementById("submit-btn2");
  const signinForm = document.getElementById("signin-form");
  const signinStatusMsg = document.getElementById("signinStatus");
  const signinSubmitBtn = document.getElementById("signin-btn");
  const profileContainer = document.getElementById("profile-details");
  const profilePosts = document.getElementById("profile-posts");
  const navigation = document.querySelector(".nav");

  function renderNavigation(session) {
    if (!navigation) return;

    navigation.innerHTML = `
      <a href="form.html">Submit HMO</a>
      ${
        session
          ? '<a href="profile.html">My Profile</a><button type="button" id="signout-btn">Sign Out</button>'
          : '<a href="signup.html">Sign Up / Sign In</a>'
      }
    `;

    const signoutButton = document.getElementById("signout-btn");
    if (signoutButton) {
      signoutButton.addEventListener("click", async () => {
        signoutButton.disabled = true;
        try {
          const { error } = await supabaseClient.auth.signOut();
          if (error) throw error;
        } catch (error) {
          console.error(error);
          signoutButton.disabled = false;
          window.alert("Unable to sign out. Please try again.");
        }
      });
    }
  }

  const { data: authListener } = supabaseClient.auth.onAuthStateChange(
    (_event, session) => renderNavigation(session),
  );
  window.addEventListener(
    "beforeunload",
    () => authListener.subscription.unsubscribe(),
    { once: true },
  );

  const { data: initialSession } = await supabaseClient.auth.getSession();
  renderNavigation(initialSession.session);

  async function fetchApprovedPosts() {
    if (!feedContainer) return;

    const { data, error } = await supabaseClient
      .from("posts")
      .select("username, content, image_url, created_at, submitted_by")
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
      .map((post) => {
        const author = post.submitted_by
          ? `<a href="profile.html?id=${encodeURIComponent(post.submitted_by)}">${escapeHTML(post.username)}</a>`
          : escapeHTML(post.username);
        const imageUrl = safeImageUrl(post.image_url);
        return `
                <div class="post">
                <div class="image-box">
                    ${imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="User upload">` : ""}
                    </div>
                    <div class="post-content">
                    <strong>👤 ${author}</strong>
                    <small style="color:#777;">• ${new Date(post.created_at).toLocaleDateString()}</small>
                    <p>${escapeHTML(post.content)}</p>
                    </div>
                </div>
            `;
      })
      .join("");
  }

  if (forumForm) {
    forumForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        postStatusMsg.className = "status-msg";
        postStatusMsg.hidden = true;
        if (!submitBtn) throw new Error("Submit button was not found.");

        const { data: sessionData, error: sessionError } =
          await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;
        const session = sessionData.session;
        if (!session) {
          postStatusMsg.innerHTML =
            'You need an account to submit an HMO. <a href="signup.html">Sign up</a> or <a href="signup.html#signin">log in</a> to continue.';
          postStatusMsg.hidden = false;
          return;
        }
        if (!forumForm.reportValidity()) return;

        submitBtn.disabled = true;
        submitBtn.innerText = "Uploading files...";

        const authorName = document.getElementById("authorName");
        const content = document.getElementById("postContent").value.trim();
        const fileInput = document.getElementById("imageFile");
        const file = fileInput.files[0];
        const { data: profile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("id, username")
          .eq("id", session.user.id)
          .single();

        if (profileError) throw profileError;
        const username = profile.username;

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
        const newPost = {
          username,
          content,
          image_url: publicImageUrl,
          submitted_by: profile.id,
        };
        const { error: dbError } = await supabaseClient
          .from("posts")
          .insert([newPost]);

        if (dbError) throw dbError;

        // Success
        forumForm.reset();
        authorName.value = username;
        postStatusMsg.hidden = false;
        postStatusMsg.textContent = "HMO submitted successfully!";
        setTimeout(() => {
          postStatusMsg.hidden = true;
        }, 5000);
      } catch (err) {
        console.error(err);
        const errorMessage =
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof err.message === "string"
            ? err.message
            : "Unable to submit your post.";
        postStatusMsg.textContent = `Error: ${errorMessage}`;
        postStatusMsg.classList.add("error");
        postStatusMsg.hidden = false;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = "Submit for Review";
        }
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!signupStatusMsg || !signupSubmitBtn) {
        console.error(
          "Signup form is missing its status message or submit button.",
        );
        return;
      }

      signupStatusMsg.textContent = "";
      signupStatusMsg.className = "status-msg";
      signupStatusMsg.hidden = true;
      signupSubmitBtn.disabled = true;
      signupSubmitBtn.textContent = "Creating account...";

      try {
        const fullName = document.getElementById("display-name").value.trim();
        const username = document
          .getElementById("username")
          .value.trim()
          .toLowerCase();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: fullName,
              username,
            },
          },
        });

        if (error) throw error;
        if (!data.user) {
          throw new Error("Account creation did not return a user.");
        }

        signupForm.reset();
        signupStatusMsg.textContent = !data.session
          ? "Account created. Please check your email to verify your account, then sign in."
          : "Account created and signed in successfully!";
        signupStatusMsg.classList.add("success");
        if (data.session) window.location.assign("profile.html");
      } catch (err) {
        console.error(err);
        const errorMessage =
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof err.message === "string"
            ? err.message
            : "Unable to create your account.";
        signupStatusMsg.textContent = `Error: ${errorMessage}`;
        signupStatusMsg.classList.add("error");
      } finally {
        signupStatusMsg.hidden = false;
        signupSubmitBtn.disabled = false;
        signupSubmitBtn.textContent = "Create Account";
      }
    });
  }

  if (signinForm) {
    signinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      signinStatusMsg.textContent = "";
      signinStatusMsg.className = "status-msg";
      signinStatusMsg.hidden = true;
      signinSubmitBtn.disabled = true;
      signinSubmitBtn.textContent = "Signing in...";

      try {
        const email = document.getElementById("signin-email").value.trim();
        const password = document.getElementById("signin-password").value;
        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.assign("profile.html");
      } catch (err) {
        console.error(err);
        signinStatusMsg.textContent = `Error: ${errorMessage(err, "Unable to sign in.")}`;
        signinStatusMsg.classList.add("error");
        signinStatusMsg.hidden = false;
      } finally {
        signinSubmitBtn.disabled = false;
        signinSubmitBtn.textContent = "Sign In";
      }
    });
  }

  if (forumForm) {
    const authorName = document.getElementById("authorName");
    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (sessionData.session) {
      const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("username")
        .eq("id", sessionData.session.user.id)
        .single();

      if (error) {
        console.error(error);
        authorName.readOnly = true;
        authorName.placeholder = "Unable to load your account username";
      } else {
        authorName.value = profile.username;
        authorName.readOnly = true;
      }
    }
  }

  if (profileContainer && profilePosts) {
    await loadProfile(supabaseClient, profileContainer, profilePosts);
  }

  if (feedContainer) fetchApprovedPosts();
}

async function loadProfile(client, profileContainer, profilePosts) {
  try {
    const requestedid = new URLSearchParams(window.location.search).get("id");
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;

    const isOwnProfile = !requestedid;
    const id = requestedid || userData.user?.id;
    if (!id) {
      profileContainer.innerHTML =
        '<p><a href="signup.html#signin">Sign in</a> to view your profile.</p>';
      profilePosts.innerHTML = "";
      return;
    }
    if (isOwnProfile && !userData.user) {
      profileContainer.innerHTML =
        '<p><a href="signup.html#signin">Sign in</a> to view your profile.</p>';
      profilePosts.innerHTML = "";
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, display_name, username")
      .eq("id", id)
      .single();
    if (profileError) throw profileError;

    const emailMarkup =
      isOwnProfile && userData.user?.email
        ? `<p><strong>Email:</strong> ${escapeHTML(userData.user.email)}</p>`
        : "";
    profileContainer.innerHTML = `
      <h1>${escapeHTML(profile.display_name)}</h1>
      <p><strong>Username:</strong> @${escapeHTML(profile.username)}</p>
      ${emailMarkup}
    `;
    document.title = `${profile.display_name} - Hear Me Outs`;

    let postsQuery = client
      .from("posts")
      .select("username, content, image_url, created_at, is_approved")
      .eq("submitted_by", profile.id)
      .order("created_at", { ascending: false });
    if (!isOwnProfile) postsQuery = postsQuery.eq("is_approved", true);
    let { data: posts, error: postsError } = await postsQuery;
    let legacyPosts = [];
    if (postsError && isMissingSubmittedBy(postsError)) {
      let legacyPostsQuery = client
        .from("posts")
        .select("username, content, image_url, created_at, is_approved")
        .eq("username", profile.username)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      ({ data: legacyPosts, error: postsError } = await legacyPostsQuery);
    } else if (!postsError) {
      const { data, error } = await client
        .from("posts")
        .select("username, content, image_url, created_at, is_approved")
        .eq("username", profile.username)
        .is("submitted_by", null)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      legacyPosts = data;
    }
    if (postsError) throw postsError;
    posts = [...(posts || []), ...(legacyPosts || [])].sort(
      (first, second) =>
        new Date(second.created_at).getTime() -
        new Date(first.created_at).getTime(),
    );

    if (!posts.length) {
      profilePosts.innerHTML = "<h2>Post History</h2><p>No posts yet.</p>";
      return;
    }
    profilePosts.innerHTML = `
      <h2>Post History</h2>
      ${posts
        .map((post) => {
          const imageUrl = safeImageUrl(post.image_url);
          const postStatus =
            isOwnProfile && !post.is_approved
              ? '<small class="post-status">Pending review</small>'
              : "";
          return `
            <article class="post">
              <div class="image-box">
                ${imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="User upload">` : ""}
              </div>
              <div class="post-content">
                <small style="color:#777;">${escapeHTML(new Date(post.created_at).toLocaleDateString())}</small>
                ${postStatus}
                <p>${escapeHTML(post.content)}</p>
              </div>
            </article>
          `;
        })
        .join("")}
    `;
  } catch (err) {
    console.error(err);
    profileContainer.innerHTML = `<p class="error">Unable to load this profile: ${escapeHTML(errorMessage(err, "Please try again later."))}</p>`;
    profilePosts.innerHTML = "";
  }
}

function isMissingSubmittedBy(error) {
  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";
  return (
    ((error?.code === "42703" || error?.code === "PGRST204") &&
      message.includes("submitted_by")) ||
    /column .*submitted_by.* does not exist|submitted_by.*(not found|schema cache)/i.test(
      message,
    )
  );
}

// Helper to prevent basic XSS script injection
function escapeHTML(str) {
  return String(str ?? "").replace(
    /[&<>'"]/g,
    (tag) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        tag
      ] || tag,
  );
}

function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function errorMessage(error, fallback) {
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : fallback;
}
initializeApp();
