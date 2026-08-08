// Phase M13.15 — one personal WhatsApp message and image per authenticated user.
(function () {
  const TABLE = "user_whatsapp_templates";
  const BUCKET = "user-whatsapp-templates";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  function client() {
    return window.customerSupabase || null;
  }

  async function userId() {
    const cached = window.CustomerAuth?.getState?.().user?.id
      || window.KYUMOfflineSessionStore?.currentUserId?.();
    if (cached) return cached;
    const supabase = client();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user?.id || null;
  }

  function validateMessage(value) {
    const message = String(value || "").trim();
    if (message.length > 2000) throw new Error("MESSAGE_TOO_LONG");
    return message;
  }

  function validateImage(file) {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("INVALID_IMAGE_TYPE");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  }

  function extensionFor(file) {
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    return "jpg";
  }

  async function load() {
    const supabase = client();
    const id = await userId();
    if (!supabase || !id) throw new Error("AUTH_REQUIRED");
    const { data, error } = await supabase
      .from(TABLE)
      .select("user_id,message_text,image_path,image_name,image_mime,updated_at")
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw error;
    return data || { user_id: id, message_text: "", image_path: null, image_name: null, image_mime: null };
  }

  async function removeStoredImage(path) {
    if (!path) return;
    const supabase = client();
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error && !/not found/i.test(error.message || "")) throw error;
  }

  async function save({ messageText = "", imageFile = null, removeImage = false } = {}) {
    const supabase = client();
    const id = await userId();
    if (!supabase || !id) throw new Error("AUTH_REQUIRED");
    const message = validateMessage(messageText);
    validateImage(imageFile);

    const existing = await load();
    let imagePath = existing.image_path || null;
    let imageName = existing.image_name || null;
    let imageMime = existing.image_mime || null;

    if (removeImage && imagePath) {
      await removeStoredImage(imagePath);
      imagePath = imageName = imageMime = null;
    }

    if (imageFile) {
      const nextPath = `${id}/default.${extensionFor(imageFile)}`;
      if (imagePath && imagePath !== nextPath) await removeStoredImage(imagePath);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(nextPath, imageFile, { upsert: true, contentType: imageFile.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      imagePath = nextPath;
      imageName = imageFile.name || `whatsapp-image.${extensionFor(imageFile)}`;
      imageMime = imageFile.type;
    }

    const payload = {
      user_id: id,
      message_text: message,
      image_path: imagePath,
      image_name: imageName,
      image_mime: imageMime,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,message_text,image_path,image_name,image_mime,updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  async function downloadImage(template) {
    if (!template?.image_path) return null;
    const supabase = client();
    const { data, error } = await supabase.storage.from(BUCKET).download(template.image_path);
    if (error) throw error;
    return new File([data], template.image_name || "whatsapp-image.jpg", {
      type: template.image_mime || data.type || "image/jpeg"
    });
  }

  function directUrl(phone, messageText = "") {
    const text = String(messageText || "").trim();
    return `https://wa.me/${encodeURIComponent(String(phone || ""))}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  }

  async function shareImageAndMessage(template, phone) {
    const message = validateMessage(template?.message_text || "");
    const file = await downloadImage(template);
    if (!file) {
      window.open(directUrl(phone, message), "_blank", "noopener,noreferrer");
      return { mode: "direct-text" };
    }
    const shareData = { text: message, files: [file] };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData);
      return { mode: "native-share" };
    }
    window.open(directUrl(phone, message), "_blank", "noopener,noreferrer");
    return { mode: "direct-text-fallback" };
  }

  window.WhatsAppTemplateService = {
    BUCKET,
    MAX_IMAGE_BYTES,
    load,
    save,
    downloadImage,
    directUrl,
    shareImageAndMessage
  };
})();
