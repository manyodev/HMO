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
    (event, session) => {
      renderNavigation(session);
      if (feedContainer && event !== "INITIAL_SESSION") {
        fetchApprovedPosts();
      }
    },
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
      .select(
        "id, username, content, image_url, created_at, submitted_by, author_profile:profiles!posts_submitted_by_profiles_fkey(avatar_url)",
      )
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
        const authorAvatar = postAuthorAvatarMarkup(
          post.author_profile?.avatar_url,
          post.username,
        );
        const imageUrl = safeImageUrl(post.image_url);
        return `
                <div class="post" data-post-id="${escapeHTML(post.id)}">
                <div class="image-box">
                    ${imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="User upload">` : ""}
                    </div>
                    <div class="post-content">
                    <div class="post-author">
                      ${authorAvatar}
                      <strong>${author}</strong>
                      <small style="color:#777;">• ${new Date(post.created_at).toLocaleDateString()}</small>
                    </div>
                    <p>${escapeHTML(post.content)}</p>
                    ${postReactionMarkup(post.id)}
                    </div>
                </div>
            `;
      })
      .join("");
    bindPostReactions(supabaseClient, feedContainer);
    bindPostComments(supabaseClient, feedContainer);
    try {
      await loadPostReactions(
        supabaseClient,
        feedContainer,
        data.map((post) => post.id),
      );
    } catch (error) {
      console.error(error);
      feedContainer.querySelectorAll(".post-reaction-status").forEach((status) => {
        status.textContent = "Reactions are currently unavailable.";
        status.hidden = false;
      });
    }
    try {
      await loadPostComments(
        supabaseClient,
        feedContainer,
        data.map((post) => post.id),
      );
    } catch (error) {
      console.error(error);
      feedContainer.querySelectorAll(".post-comments-status").forEach((status) => {
        status.textContent = "Comments are currently unavailable.";
        status.hidden = false;
      });
    }
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
          .select("id, display_name")
          .eq("id", session.user.id)
          .single();

        if (profileError) throw profileError;
        const displayName = profile.display_name;

        if (!file) throw new Error("Please choose an image to upload.");

        // 1. Generate a completely unique file name to prevent collision overwrites
        const fileExtension = file.name.split(".").pop();
        const uniqueFileName = `${session.user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;

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
          username: displayName,
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
        authorName.value = displayName;
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
        .select("display_name")
        .eq("id", sessionData.session.user.id)
        .single();

      if (error) {
        console.error(error);
        authorName.readOnly = true;
        authorName.placeholder = "Unable to load your display name";
      } else {
        authorName.value = profile.display_name;
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
      .select("id, display_name, username, avatar_url")
      .eq("id", id)
      .single();
    if (profileError) throw profileError;

    const avatarUrl = safeImageUrl(profile.avatar_url);
    const avatarMarkup = avatarUrl
      ? `<img class="profile-avatar" src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(profile.display_name)}'s profile picture">`
      : '<div class="profile-avatar profile-avatar-placeholder" aria-hidden="true"><i class="fa-regular fa-user"></i></div>';
    const emailMarkup =
      isOwnProfile && userData.user?.email
        ? `<p><strong>Email:</strong> ${escapeHTML(userData.user.email)}</p>`
        : "";
    profileContainer.innerHTML = `
      <div class="profile-heading">
        ${avatarMarkup}
        <div>
          <h1>${escapeHTML(profile.display_name)}</h1>
          <p><strong>Username:</strong> @${escapeHTML(profile.username)}</p>
          ${emailMarkup}
        </div>
      </div>
      ${
        isOwnProfile
          ? `<form id="profile-edit-form" class="profile-edit-form">
              <h2>Edit Profile</h2>
              <p class="status-msg" id="profile-edit-status" aria-live="polite" hidden></p>
              <label for="profile-display-name">Display name</label>
              <input id="profile-display-name" name="display_name" type="text" maxlength="80" value="${escapeHTML(profile.display_name)}" required>
              <label for="profile-avatar-file">Profile picture (optional)</label>
              <input id="profile-avatar-file" name="avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
              <button type="submit" id="profile-save-btn">Save changes</button>
            </form>`
          : ""
      }
    `;
    document.title = `${profile.display_name} - Hear Me Outs`;

    const editForm = document.getElementById("profile-edit-form");
    if (editForm) {
      const statusMessage = document.getElementById("profile-edit-status");
      const saveButton = document.getElementById("profile-save-btn");
      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        statusMessage.textContent = "";
        statusMessage.className = "status-msg";
        statusMessage.hidden = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
          const displayName = document
            .getElementById("profile-display-name")
            .value.trim();
          const avatarFile = document.getElementById("profile-avatar-file")
            .files[0];
          if (!displayName || displayName.length > 80) {
            throw new Error("Display name must be between 1 and 80 characters.");
          }

          const updates = { display_name: displayName };
          if (avatarFile) {
            const allowedTypes = [
              "image/png",
              "image/jpeg",
              "image/webp",
              "image/gif",
            ];
            if (!allowedTypes.includes(avatarFile.type)) {
              throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
            }
            if (avatarFile.size > 5 * 1024 * 1024) {
              throw new Error("Profile pictures must be 5 MB or smaller.");
            }

            const extension = {
              "image/png": "png",
              "image/jpeg": "jpg",
              "image/webp": "webp",
              "image/gif": "gif",
            }[avatarFile.type];
            const avatarPath = `${profile.id}/avatars/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
            const { error: uploadError } = await client.storage
              .from("user-images")
              .upload(avatarPath, avatarFile, { contentType: avatarFile.type });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = client.storage
              .from("user-images")
              .getPublicUrl(avatarPath);
            updates.avatar_url = publicUrlData.publicUrl;
          }

          const { error: updateError } = await client
            .from("profiles")
            .update(updates)
            .eq("id", profile.id);
          if (updateError) throw updateError;

          await loadProfile(client, profileContainer, profilePosts);
        } catch (error) {
          console.error(error);
          statusMessage.textContent = `Unable to save your profile: ${errorMessage(error, "Please try again.")}`;
          statusMessage.classList.add("error");
          statusMessage.hidden = false;
        } finally {
          if (saveButton.isConnected) {
            saveButton.disabled = false;
            saveButton.textContent = "Save changes";
          }
        }
      });
    }

    let postsQuery = client
      .from("posts")
      .select("id, username, content, image_url, created_at, is_approved")
      .eq("submitted_by", profile.id)
      .order("created_at", { ascending: false });
    if (!isOwnProfile) postsQuery = postsQuery.eq("is_approved", true);
    let { data: posts, error: postsError } = await postsQuery;
    let legacyPosts = [];
    if (postsError && isMissingSubmittedBy(postsError)) {
      let legacyPostsQuery = client
        .from("posts")
        .select("id, username, content, image_url, created_at, is_approved")
        .eq("username", profile.username)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      ({ data: legacyPosts, error: postsError } = await legacyPostsQuery);
    } else if (!postsError) {
      const { data, error } = await client
        .from("posts")
        .select("id, username, content, image_url, created_at, is_approved")
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
          const authorAvatar = postAuthorAvatarMarkup(
            profile.avatar_url,
            profile.display_name,
          );
          const postStatus =
            isOwnProfile && !post.is_approved
              ? '<small class="post-status">Pending review</small>'
              : "";
          return `
            <article class="post" data-post-id="${escapeHTML(post.id)}">
              <div class="image-box">
                ${imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="User upload">` : ""}
              </div>
              <div class="post-content">
                <div class="post-author">
                  ${authorAvatar}
                  <strong>${escapeHTML(profile.display_name)}</strong>
                  <small style="color:#777;">• ${escapeHTML(new Date(post.created_at).toLocaleDateString())}</small>
                </div>
                ${postStatus}
                <p>${escapeHTML(post.content)}</p>
                ${postReactionMarkup(post.id)}
              </div>
            </article>
          `;
        })
        .join("")}
    `;
    bindPostReactions(client, profilePosts);
    bindPostComments(client, profilePosts);
    try {
      await loadPostReactions(
        client,
        profilePosts,
        posts.map((post) => post.id),
      );
    } catch (error) {
      console.error(error);
      profilePosts.querySelectorAll(".post-reaction-status").forEach((status) => {
        status.textContent = "Reactions are currently unavailable.";
        status.hidden = false;
      });
    }
    try {
      await loadPostComments(
        client,
        profilePosts,
        posts.map((post) => post.id),
      );
    } catch (error) {
      console.error(error);
      profilePosts.querySelectorAll(".post-comments-status").forEach((status) => {
        status.textContent = "Comments are currently unavailable.";
        status.hidden = false;
      });
    }
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

function postAuthorAvatarMarkup(value, displayName) {
  const avatarUrl = safeImageUrl(value);
  if (avatarUrl) {
    return `<img class="post-author-avatar" src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(displayName)}'s profile picture">`;
  }
  return '<span class="post-author-avatar post-author-avatar-placeholder" aria-hidden="true"><i class="fa-regular fa-user"></i></span>';
}

function postReactionMarkup(postId) {
  const reactions = [
    { type: "like", label: "Like", image: "like.png" },
    { type: "dislike", label: "Dislike", image: "dislike.png" },
    { type: "react", label: "React", image: "react.png" },
  ];
  return `
    <div class="post-reactions" aria-label="Post reactions">
      ${reactions
        .map(
          ({ type, label, image }) => `
            <div class="post-reaction-option">
              <button class="post-reaction" type="button" data-reaction="${type}" aria-label="${label}" aria-pressed="false">
                <img src="images/design/${image}" alt="">
              </button>
              <span class="post-reaction-count" aria-live="polite">0</span>
            </div>`,
        )
        .join("")}
      <button class="post-comment-toggle" type="button" aria-expanded="false" aria-controls="post-comments-${escapeHTML(postId)}">
        <i class="fa-regular fa-comment" aria-hidden="true"></i>
        
        <span class="post-comment-count" aria-live="polite">0</span>
      </button>
      <p class="post-reaction-status" role="status" hidden></p>
    </div>
    ${postCommentMarkup(postId)}
  `;
}

function postCommentMarkup(postId) {
  const commentsId = `post-comments-${escapeHTML(postId)}`;
  return `
    <section class="post-comments" id="${commentsId}" hidden>
      <ol class="post-comments-list" aria-label="Comments"></ol>
      <p class="post-comments-status" role="status" hidden></p>
      <form class="post-comment-form">
        <label for="${commentsId}-input">Add a comment</label>
        <textarea id="${commentsId}-input" name="content" maxlength="1000" required></textarea>
        <button type="submit">Post comment</button>
      </form>
    </section>
  `;
}

function bindPostReactions(client, container) {
  if (container.dataset.reactionsBound) return;
  container.dataset.reactionsBound = "true";
  container.addEventListener("click", async (event) => {
    const button = event.target.closest(".post-reaction");
    if (!button || !container.contains(button)) return;

    const post = button.closest("[data-post-id]");
    if (!post) return;
    const status = post.querySelector(".post-reaction-status");
    const buttons = post.querySelectorAll(".post-reaction");
    buttons.forEach((reactionButton) => {
      reactionButton.disabled = true;
    });
    status.hidden = true;

    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        status.innerHTML =
          'Sign in to react. <a href="signup.html#signin">Sign in</a>';
        status.hidden = false;
        return;
      }

      const { data: currentReaction, error: currentError } = await client
        .from("post_reactions")
        .select("reaction_type")
        .eq("post_id", post.dataset.postId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (currentError) throw currentError;

      if (currentReaction?.reaction_type === button.dataset.reaction) {
        const { error } = await client
          .from("post_reactions")
          .delete()
          .eq("post_id", post.dataset.postId)
          .eq("user_id", userData.user.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("post_reactions").upsert(
          {
            post_id: post.dataset.postId,
            user_id: userData.user.id,
            reaction_type: button.dataset.reaction,
          },
          { onConflict: "post_id,user_id" },
        );
        if (error) throw error;
      }

      await loadPostReactions(client, container, [post.dataset.postId]);
    } catch (error) {
      console.error(error);
      status.textContent = `Unable to save reaction: ${errorMessage(error, "Please try again.")}`;
      status.hidden = false;
    } finally {
      buttons.forEach((reactionButton) => {
        reactionButton.disabled = false;
      });
    }
  });
}

function bindPostComments(client, container) {
  if (container.dataset.commentsBound) return;
  container.dataset.commentsBound = "true";

  container.addEventListener("click", (event) => {
    const button = event.target.closest(".post-comment-toggle");
    if (!button || !container.contains(button)) return;

    const post = button.closest("[data-post-id]");
    const comments = post?.querySelector(".post-comments");
    if (!comments) return;

    const isOpening = comments.hidden;
    comments.hidden = !isOpening;
    button.setAttribute("aria-expanded", String(isOpening));
    if (isOpening) comments.querySelector("textarea").focus();
  });

  container.addEventListener("submit", async (event) => {
    const form = event.target.closest(".post-comment-form");
    if (!form || !container.contains(form)) return;
    event.preventDefault();

    const post = form.closest("[data-post-id]");
    const input = form.querySelector("textarea");
    const submitButton = form.querySelector('button[type="submit"]');
    const status = post.querySelector(".post-comments-status");
    const content = input.value.trim();
    status.hidden = true;
    if (!content || content.length > 1000) {
      status.textContent = "Comments must be between 1 and 1000 characters.";
      status.hidden = false;
      return;
    }

    submitButton.disabled = true;
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        status.innerHTML =
          'Sign in to comment. <a href="signup.html#signin">Sign in</a>';
        status.hidden = false;
        return;
      }

      const { error } = await client.from("post_comments").insert({
        post_id: post.dataset.postId,
        user_id: userData.user.id,
        content,
      });
      if (error) throw error;

      input.value = "";
      try {
        await loadPostComments(client, container, [post.dataset.postId]);
        status.textContent = "Comment posted.";
      } catch (error) {
        console.error(error);
        status.textContent =
          "Comment posted, but the comments could not be refreshed.";
      }
      status.hidden = false;
    } catch (error) {
      console.error(error);
      status.textContent = `Unable to post comment: ${errorMessage(error, "Please try again.")}`;
      status.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function loadPostReactions(client, container, postIds) {
  if (!postIds.length) return;
  postIds = postIds.map(String);

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { data: reactions, error } = await client
    .from("post_reactions")
    .select("post_id, user_id, reaction_type")
    .in("post_id", postIds);
  if (error) throw error;

  const counts = new Map();
  for (const reaction of reactions) {
    const key = `${String(reaction.post_id)}:${reaction.reaction_type}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (const post of container.querySelectorAll("[data-post-id]")) {
    if (!postIds.includes(post.dataset.postId)) continue;
    const postReactions = reactions.filter(
      (reaction) => String(reaction.post_id) === post.dataset.postId,
    );
    for (const button of post.querySelectorAll(".post-reaction")) {
      const type = button.dataset.reaction;
      const count = counts.get(`${post.dataset.postId}:${type}`) || 0;
      button
        .closest(".post-reaction-option")
        .querySelector(".post-reaction-count").textContent = count;
      const isSelected = postReactions.some(
        (reaction) =>
          reaction.user_id === userData.user?.id &&
          reaction.reaction_type === type,
      );
      button.setAttribute("aria-pressed", String(isSelected));
      button.classList.toggle("is-selected", isSelected);
    }
  }
}

async function loadPostComments(client, container, postIds) {
  if (!postIds.length) return;
  postIds = postIds.map(String);

  const { data: comments, error } = await client
    .from("post_comments")
    .select(
      "id, post_id, content, created_at, author:profiles!post_comments_user_id_profiles_fkey(display_name)",
    )
    .in("post_id", postIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const commentsByPost = new Map();
  for (const comment of comments) {
    const postId = String(comment.post_id);
    const postComments = commentsByPost.get(postId) || [];
    postComments.push(comment);
    commentsByPost.set(postId, postComments);
  }

  for (const post of container.querySelectorAll("[data-post-id]")) {
    if (!postIds.includes(post.dataset.postId)) continue;
    const postComments = commentsByPost.get(post.dataset.postId) || [];
    post.querySelector(".post-comment-count").textContent =
      postComments.length;
    post.querySelector(".post-comments-list").innerHTML = postComments
      .map(
        (comment) => `
          <li>
            <strong>${escapeHTML(comment.author?.display_name || "User")}</strong>
            <time datetime="${escapeHTML(comment.created_at)}">${escapeHTML(new Date(comment.created_at).toLocaleString())}</time>
            <p>${escapeHTML(comment.content)}</p>
          </li>`,
      )
      .join("");
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
