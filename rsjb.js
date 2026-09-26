(async function () {
    // =========================================================================
    // AUTO-DETECT WORDPRESS WEBSITE LINK & WP RANDOM POST PICKUP
    // =========================================================================
    function getWpApiEndpoint() {
        try {
            // 1. Check for standard WordPress REST API link tag in <head>
            const restLink = document.querySelector('link[rel="https://api.w.org/"]') ||
                document.querySelector('link[rel="alternate"][type="application/json"][href*="/wp-json"]');
            if (restLink && restLink.href) {
                const ep = restLink.href.replace(/\/+$/, '');
                sessionStorage.setItem("wp_api_endpoint", ep);
                return ep;
            }
            // 2. Check window.wpApiSettings if injected by WordPress
            if (typeof window !== 'undefined' && window.wpApiSettings && window.wpApiSettings.root) {
                const ep = window.wpApiSettings.root.replace(/\/+$/, '');
                sessionStorage.setItem("wp_api_endpoint", ep);
                return ep;
            }
            // 3. Check sessionStorage cache
            const cachedEp = sessionStorage.getItem("wp_api_endpoint");
            if (cachedEp) return cachedEp;
        } catch (e) { }

        // 4. Default fallback: current website origin + /wp-json
        const fallbackEp = `${window.location.origin}/wp-json`;
        try { sessionStorage.setItem("wp_api_endpoint", fallbackEp); } catch (e) { }
        return fallbackEp;
    }

    let wpPosts = [];

    // Helper function to pick random target WordPress post permalink
    function getRandomTargetUrl() {
        let pool = (wpPosts && wpPosts.length > 0) ? wpPosts : (window.__wp_posts || []);
        if (!pool || pool.length === 0) {
            try {
                const cached = sessionStorage.getItem("wp_posts_cache");
                if (cached) pool = JSON.parse(cached);
            } catch (e) { }
        }
        if (Array.isArray(pool) && pool.length > 0) {
            const current = window.location.href.split('?')[0].replace(/\/+$/, '');
            const filtered = pool.filter(u => typeof u === 'string' && u.split('?')[0].replace(/\/+$/, '') !== current);
            const finalPool = filtered.length > 0 ? filtered : pool;
            return finalPool[Math.floor(Math.random() * finalPool.length)];
        }
        return window.location.origin + '/';
    }

    // Function to load dynamic WordPress posts from WP REST API
    async function fetchWpPosts() {
        // 1. Check memory cache
        if (window.__wp_posts && Array.isArray(window.__wp_posts) && window.__wp_posts.length > 0) {
            wpPosts = window.__wp_posts;
            return wpPosts;
        }

        // 2. Check sessionStorage cache
        try {
            const cached = sessionStorage.getItem("wp_posts_cache");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    wpPosts = parsed;
                    window.__wp_posts = parsed;
                    return wpPosts;
                }
            }
        } catch (e) { }

        const apiEndpoint = getWpApiEndpoint();
        let posts = [];

        try {
            let res = await fetch(`${apiEndpoint}/wp/v2/posts?per_page=50&_fields=link`, { cache: "no-store" });
            if (!res.ok) {
                res = await fetch(`${apiEndpoint}/wp/v2/posts?per_page=10&_fields=link`, { cache: "no-store" });
            }
            if (res.ok) {
                const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1", 10);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    posts = data.map(item => item && (item.link || (item.guid && item.guid.rendered))).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
                }

                if (totalPages > 1) {
                    const randomPage = Math.floor(Math.random() * Math.min(totalPages, 10)) + 1;
                    if (randomPage !== 1) {
                        try {
                            const pageRes = await fetch(`${apiEndpoint}/wp/v2/posts?per_page=20&page=${randomPage}&_fields=link`, { cache: "no-store" });
                            if (pageRes.ok) {
                                const pageData = await pageRes.json();
                                if (Array.isArray(pageData) && pageData.length > 0) {
                                    const extra = pageData.map(item => item && (item.link || (item.guid && item.guid.rendered))).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
                                    posts = Array.from(new Set([...posts, ...extra]));
                                }
                            }
                        } catch (err) { }
                    }
                }
            }
        } catch (err) {
            console.warn("[WP Auto Detect] REST API fetch error:", err);
        }

        // 3. Fallback: Parse internal links from DOM
        if (!posts || posts.length === 0) {
            try {
                const origin = window.location.origin;
                const domLinks = Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(href => {
                        try {
                            const u = new URL(href);
                            return u.origin === origin &&
                                !href.includes('/wp-admin') &&
                                !href.includes('/wp-login') &&
                                !href.includes('/wp-content') &&
                                !href.includes('/wp-includes') &&
                                !href.includes('/wp-json') &&
                                !href.includes('#') &&
                                !/\.(jpg|jpeg|png|gif|svg|css|js|webp|pdf|zip|mp4)$/i.test(u.pathname) &&
                                u.pathname !== '/' &&
                                u.pathname !== '';
                        } catch (e) {
                            return false;
                        }
                    });
                if (domLinks.length > 0) {
                    posts = Array.from(new Set(domLinks));
                }
            } catch (e) { }
        }

        // 4. Ultimate fallback: site homepage
        if (!posts || posts.length === 0) {
            posts = [window.location.origin + '/'];
        }

        wpPosts = posts;
        window.__wp_posts = posts;
        try {
            sessionStorage.setItem("wp_posts_cache", JSON.stringify(posts));
        } catch (e) { }

        return posts;
    }

    // Load WP posts before handling redirect or document render
    await fetchWpPosts();

    const url = new URL(window.location.href);
    const ind = url.searchParams.get("jcfd");

    if (ind) {
        sessionStorage.setItem("jcfd", ind);
        sessionStorage.setItem("jcfdtime", (Date.now() + 60 * 1000).toString());
        url.searchParams.delete("jcfd");
        const targetUrl = getRandomTargetUrl();
        if (targetUrl) {
            window.location.href = targetUrl;
            return;
        }
    }

    const expTime = parseInt(sessionStorage.getItem("jcfdtime") || "0", 10);
    if (expTime && Date.now() > expTime) {
        sessionStorage.removeItem("jcfdtime");
        sessionStorage.removeItem("jcfd");
    }

    const stcd = sessionStorage.getItem("jcfd");
    const isDirectPreview = url.searchParams.get("preview") === "1" || url.searchParams.get("movieverse") === "1";

    if (stcd === "xyz" || isDirectPreview) {
        document.body.innerHTML = '<span style="display:none;">my error</span>';
        document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => el.remove());

        document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
    <title>MovieVerse - Stream 4K UHD Movies & Web Series Online</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-main: #07090e;
            --bg-card: #0f141f;
            --bg-card-hover: #161d2d;
            --accent-red: #e50914;
            --accent-red-hover: #ff2a3b;
            --accent-gradient: linear-gradient(135deg, #e50914 0%, #ff3b30 100%);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --border-color: rgba(255, 255, 255, 0.08);
            --border-focus: rgba(229, 9, 20, 0.5);
            --badge-gold: #f5c518;
            --badge-blue: #38bdf8;
            --badge-green: #10b981;
            --font-main: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            --font-sub: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            background-color: var(--bg-main);
            color: var(--text-primary);
            font-family: var(--font-main);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            overflow-x: hidden;
            width: 100%;
        }

        a {
            color: inherit;
            text-decoration: none;
        }

        button {
            font-family: inherit;
            cursor: pointer;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: #090c12;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.16);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(229, 9, 20, 0.6);
        }

        /* Top Header */
        #header {
            position: sticky;
            top: 0;
            z-index: 1000;
            background: rgba(7, 9, 14, 0.94);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border-color);
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.7);
        }
        .topHeader {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            max-width: 1400px;
            margin: 0 auto;
            gap: 16px;
        }
        .logo-area {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            user-select: none;
            flex-shrink: 0;
        }
        .logo-icon {
            font-size: 24px;
            font-weight: 900;
            letter-spacing: -0.5px;
            background: var(--accent-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .logo-tag {
            font-size: 10px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            background: rgba(229, 9, 20, 0.15);
            color: #ff4757;
            padding: 2px 7px;
            border-radius: 4px;
            font-weight: 800;
            border: 1px solid rgba(229, 9, 20, 0.35);
        }

        .searchInput {
            flex: 1;
            max-width: 480px;
            position: relative;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            border-radius: 30px;
            padding: 9px 16px 9px 42px;
            display: flex;
            align-items: center;
            color: var(--text-secondary);
            font-size: 13.5px;
            cursor: pointer;
            transition: all 0.25s ease;
        }
        .searchInput:hover, .searchInput:focus-within {
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--border-focus);
            color: #fff;
            box-shadow: 0 0 16px rgba(229, 9, 20, 0.2);
        }
        .searchInput svg {
            position: absolute;
            left: 15px;
            width: 17px;
            height: 17px;
            fill: var(--text-secondary);
            transition: fill 0.2s;
        }
        .searchInput:hover svg {
            fill: #fff;
        }
        .searchInput input {
            background: transparent;
            border: none;
            outline: none;
            color: #fff;
            width: 100%;
            font-size: 13.5px;
            font-family: inherit;
        }
        .searchInput input::placeholder {
            color: var(--text-secondary);
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
        }
        .vip-btn {
            background: var(--accent-gradient);
            color: #fff;
            padding: 8px 18px;
            border-radius: 24px;
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 6px;
            border: none;
            box-shadow: 0 4px 16px rgba(229, 9, 20, 0.45);
            transition: all 0.2s ease;
            letter-spacing: 0.3px;
        }
        .vip-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 22px rgba(229, 9, 20, 0.65);
        }

        /* Nav Menu */
        .tm_header_main_menu {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0 20px;
            max-width: 1400px;
            margin: 0 auto;
            overflow-x: auto;
            scrollbar-width: none;
            border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        .tm_header_main_menu::-webkit-scrollbar {
            display: none;
        }
        .tm_paid_tab {
            display: inline-block;
            padding: 11px 16px;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-secondary);
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s ease;
            border-bottom: 2px solid transparent;
            letter-spacing: 0.5px;
        }
        .tm_paid_tab:hover, .tm_paid_tab.active {
            color: #fff;
            border-bottom-color: var(--accent-red);
        }

        /* Main Content Container */
        .tm_main_content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px 20px 40px;
        }

        /* Categories / Genre Bar */
        .categoriesWrapper {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            padding: 4px 0 16px;
            margin-bottom: 20px;
            scrollbar-width: none;
        }
        .categoriesWrapper::-webkit-scrollbar {
            display: none;
        }
        .categories-tags {
            background: rgba(255, 255, 255, 0.04);
            color: #cbd5e1;
            padding: 7px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            cursor: pointer;
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
        }
        .categories-tags:hover, .categories-tags.active {
            background: rgba(229, 9, 20, 0.16);
            color: #fff;
            border-color: rgba(229, 9, 20, 0.45);
            box-shadow: 0 0 12px rgba(229, 9, 20, 0.2);
        }

        /* Movie Watch / Video Player Area */
        .watch-contentWrapper {
            background: var(--bg-card);
            border-radius: 16px;
            border: 1px solid var(--border-color);
            overflow: hidden;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
            margin-bottom: 28px;
        }
        .topTitleWrap {
            padding: 18px 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0) 100%);
        }
        .movie-meta-bar {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 12.5px;
        }
        .badge-imdb {
            background: var(--badge-gold);
            color: #000;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
        }
        .badge-quality {
            background: rgba(56, 189, 248, 0.15);
            color: var(--badge-blue);
            border: 1px solid rgba(56, 189, 248, 0.35);
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 700;
            font-size: 11px;
            letter-spacing: 0.5px;
        }
        .badge-meta {
            color: var(--text-secondary);
            font-weight: 500;
        }
        .badge-audio {
            background: rgba(255, 255, 255, 0.07);
            color: #cbd5e1;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: 600;
        }
        .videoTitle {
            font-size: 22px;
            font-weight: 800;
            color: #fff;
            line-height: 1.35;
            letter-spacing: -0.3px;
        }

        /* Streaming Server Switcher & Controls Bar */
        .server-switcher-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: rgba(0, 0, 0, 0.45);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            gap: 12px;
            flex-wrap: wrap;
        }
        .server-buttons-group {
            display: flex;
            align-items: center;
            gap: 8px;
            overflow-x: auto;
            scrollbar-width: none;
            padding-bottom: 2px;
        }
        .server-buttons-group::-webkit-scrollbar {
            display: none;
        }
        .server-label {
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 800;
            letter-spacing: 1px;
            white-space: nowrap;
        }
        .server-btn {
            background: rgba(255, 255, 255, 0.06);
            color: #cbd5e1;
            padding: 7px 14px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid var(--border-color);
            white-space: nowrap;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .server-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
            border-color: rgba(255, 255, 255, 0.2);
        }
        .server-btn.active {
            background: var(--accent-gradient);
            color: #fff;
            border-color: transparent;
            box-shadow: 0 2px 10px rgba(229, 9, 20, 0.4);
        }
        .custom-link-btn {
            background: rgba(56, 189, 248, 0.12);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.3);
            padding: 7px 14px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .custom-link-btn:hover {
            background: rgba(56, 189, 248, 0.22);
            border-color: #38bdf8;
            color: #fff;
        }

        /* Responsive Video Player Container */
        .tm_playWrapper {
            position: relative;
            background: #000;
            width: 100%;
            aspect-ratio: 16 / 9;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .tm_playWrapper video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
            outline: none;
        }

        /* Big Play Button Overlay (Visible before first play) */
        .play-overlay-center {
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            z-index: 25;
            cursor: pointer;
            transition: opacity 0.3s ease;
        }
        .big-play-icon {
            width: 76px;
            height: 76px;
            border-radius: 50%;
            background: var(--accent-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 35px rgba(229, 9, 20, 0.7);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .big-play-icon svg {
            width: 34px;
            height: 34px;
            fill: #fff;
            margin-left: 4px;
        }
        .play-overlay-center:hover .big-play-icon {
            transform: scale(1.12);
            box-shadow: 0 0 45px rgba(229, 9, 20, 0.9);
        }
        .play-overlay-text {
            font-size: 15px;
            font-weight: 700;
            color: #fff;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            padding: 6px 18px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            letter-spacing: 0.5px;
        }

        /* 30-Second Preview Timer Badge */
        .preview-badge-container {
            position: absolute;
            top: 14px;
            left: 14px;
            z-index: 28;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            gap: 4px;
            background: rgba(11, 14, 20, 0.85);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 6px 12px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.5);
        }
        #previewTimerBadge {
            font-size: 12px;
            font-weight: 700;
            color: #fbbf24;
            display: flex;
            align-items: center;
            gap: 5px;
            letter-spacing: 0.3px;
        }
        .preview-progress-track {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            overflow: hidden;
        }
        .preview-progress-bar {
            width: 0%;
            height: 100%;
            background: #e50914;
            transition: width 0.2s linear;
        }

        /* Preview Expired (30s) Paywall Overlay */
        .preview-locked-overlay {
            position: absolute;
            inset: 0;
            background: rgba(7, 9, 14, 0.94);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 35;
            padding: 24px;
            text-align: center;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
        }
        .locked-card {
            max-width: 440px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 28px 24px;
            border-radius: 16px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
        }
        .locked-icon {
            font-size: 40px;
            width: 68px;
            height: 68px;
            border-radius: 50%;
            background: rgba(229, 9, 20, 0.15);
            border: 2px solid var(--accent-red);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 25px rgba(229, 9, 20, 0.35);
        }
        .locked-card h3 {
            font-size: 20px;
            font-weight: 800;
            color: #fff;
        }
        .locked-card p {
            font-size: 13.5px;
            color: var(--text-secondary);
            line-height: 1.5;
        }
        .locked-actions {
            display: flex;
            gap: 12px;
            width: 100%;
            margin-top: 8px;
            flex-wrap: wrap;
        }
        .locked-btn {
            flex: 1;
            min-width: 140px;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            border: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .locked-btn.replay-btn {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .locked-btn.replay-btn:hover {
            background: rgba(255, 255, 255, 0.18);
        }
        .locked-btn.vip-btn {
            background: var(--accent-gradient);
            color: #fff;
            box-shadow: 0 4px 14px rgba(229, 9, 20, 0.5);
        }
        .locked-btn.vip-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(229, 9, 20, 0.7);
        }

        /* INVISIBLE AD OVERLAY (Directly over the player play button) */
        .invisible-ad-overlay {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 30;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            cursor: pointer;
            overflow: hidden;
        }
        .gpt-ad-slot {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Action Bar Below Player */
        .watch-metadata {
            padding: 16px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            background: rgba(0, 0, 0, 0.25);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .action-group {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .action-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            color: #cbd5e1;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
        }
        .action-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
            border-color: rgba(255, 255, 255, 0.2);
        }
        .action-btn.active {
            color: #ff4757;
            border-color: rgba(229, 9, 20, 0.4);
            background: rgba(229, 9, 20, 0.1);
        }
        .action-btn.download-btn {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #fff;
            border: none;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
        }
        .action-btn.download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(16, 185, 129, 0.5);
        }

        /* Movie Synopsis Box */
        .movie-info-box {
            padding: 22px 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            flex-direction: column;
            gap: 14px;
            font-size: 14px;
            color: var(--text-secondary);
        }
        .movie-info-box p {
            line-height: 1.7;
            color: #e2e8f0;
        }
        .movie-info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 12px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .movie-info-row {
            display: flex;
            align-items: baseline;
            gap: 8px;
            font-size: 13px;
        }
        .movie-info-label {
            color: var(--text-muted);
            font-weight: 700;
            min-width: 75px;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.5px;
        }
        .movie-info-val {
            color: #cbd5e1;
        }

        /* Section Headings */
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 36px 0 18px;
        }
        .section-title {
            font-size: 21px;
            font-weight: 800;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 10px;
            letter-spacing: -0.3px;
        }
        .section-title::before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 22px;
            background: var(--accent-gradient);
            border-radius: 3px;
        }

        /* Movie Cards Grid */
        .movie-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
            gap: 20px;
        }
        .movie-card {
            background: var(--bg-card);
            border-radius: 12px;
            border: 1px solid var(--border-color);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            cursor: pointer;
            transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        .movie-card:hover {
            transform: translateY(-6px);
            box-shadow: 0 14px 30px rgba(0, 0, 0, 0.75);
            border-color: rgba(229, 9, 20, 0.5);
        }
        .poster-container {
            position: relative;
            width: 100%;
            aspect-ratio: 2 / 3;
            overflow: hidden;
            background: #151b28;
        }
        .poster-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.35s ease;
        }
        .movie-card:hover .poster-container img {
            transform: scale(1.06);
        }
        .card-badge-rating {
            position: absolute;
            top: 8px;
            left: 8px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(8px);
            color: var(--badge-gold);
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 4px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .card-badge-quality {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(229, 9, 20, 0.9);
            backdrop-filter: blur(8px);
            color: #fff;
            padding: 2px 7px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }
        .card-badge-duration {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(8px);
            color: #cbd5e1;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }
        .card-play-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        .movie-card:hover .card-play-overlay {
            opacity: 1;
        }
        .play-circle {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: var(--accent-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            box-shadow: 0 0 20px rgba(229, 9, 20, 0.7);
            transform: scale(0.85);
            transition: transform 0.25s ease;
        }
        .movie-card:hover .play-circle {
            transform: scale(1);
        }
        .play-circle svg {
            width: 22px;
            height: 22px;
            fill: #fff;
            margin-left: 2px;
        }
        .movie-card-body {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
        }
        .movie-card-title {
            font-size: 13.5px;
            font-weight: 700;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .movie-card-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11.5px;
            color: var(--text-muted);
        }

        /* In-Page Ad Container Styles */
        .ad-container-box {
            margin: 20px auto;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 50px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 8px;
            padding: 8px;
            max-width: 100%;
            overflow: hidden;
        }
        .ad-label {
            font-size: 10px;
            color: var(--text-muted);
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        /* Modal Styles (Custom Video Link, VIP, Download) */
        .modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(12px);
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.2s ease;
        }
        .modal-content {
            background: #111622;
            border: 1px solid var(--border-color);
            border-radius: 16px;
            max-width: 520px;
            width: 100%;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9);
            overflow: hidden;
        }
        .modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .modal-title {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .modal-close-btn {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #94a3b8;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .modal-close-btn:hover {
            background: rgba(229, 9, 20, 0.2);
            color: #fff;
        }
        .modal-body {
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .modal-input {
            width: 100%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 12px 14px;
            color: #fff;
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.2s;
        }
        .modal-input:focus {
            border-color: var(--accent-red);
        }
        .preset-links-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .preset-title {
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
        }
        .preset-chip {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-color);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12.5px;
            color: #cbd5e1;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .preset-chip:hover {
            background: rgba(229, 9, 20, 0.15);
            border-color: rgba(229, 9, 20, 0.4);
            color: #fff;
        }
        .modal-submit-btn {
            background: var(--accent-gradient);
            color: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            border: none;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(229, 9, 20, 0.45);
            transition: all 0.2s;
        }
        .modal-submit-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 18px rgba(229, 9, 20, 0.6);
        }

        /* Toast Message */
        .toast-msg {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: rgba(17, 24, 39, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #fff;
            padding: 10px 24px;
            border-radius: 30px;
            font-size: 13.5px;
            font-weight: 600;
            z-index: 100000;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: none;
        }
        .toast-msg.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        /* Footer */
        .site-footer {
            margin-top: 60px;
            padding: 36px 20px;
            border-top: 1px solid var(--border-color);
            background: #05070a;
            text-align: center;
            color: var(--text-muted);
            font-size: 13px;
        }
        .site-footer p {
            margin-bottom: 8px;
            line-height: 1.6;
        }

        /* Responsive Breakpoints */
        @media (max-width: 1024px) {
            .movie-grid {
                grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
                gap: 16px;
            }
        }
        @media (max-width: 768px) {
            .topHeader {
                padding: 10px 14px;
                gap: 10px;
            }
            .searchInput {
                max-width: 100%;
                order: 3;
                width: 100%;
                margin-top: 6px;
            }
            .topHeader {
                flex-wrap: wrap;
            }
            .tm_main_content {
                padding: 14px 12px 30px;
            }
            .videoTitle {
                font-size: 18px;
            }
            .topTitleWrap {
                padding: 14px 16px;
            }
            .movie-info-box {
                padding: 16px;
            }
            .movie-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }
            .watch-metadata {
                padding: 14px 16px;
                justify-content: center;
            }
            .action-group {
                justify-content: center;
                width: 100%;
            }
            .big-play-icon {
                width: 60px;
                height: 60px;
            }
            .big-play-icon svg {
                width: 26px;
                height: 26px;
            }
        }
        @media (max-width: 480px) {
            .logo-icon {
                font-size: 20px;
            }
            .logo-tag {
                display: none;
            }
            .vip-btn {
                padding: 6px 12px;
                font-size: 12px;
            }
            .server-switcher-bar {
                padding: 10px 12px;
            }
            .action-btn {
                padding: 7px 12px;
                font-size: 12px;
            }
        }
    </style>
</head>
<body>
    <div id="pageWrapper">
        <div id="mainWrapper">
            <!-- Header -->
            <header id="header">
                <div class="topHeader">
                    <div class="logo-area" id="js_navigationMenu" onclick="window.scrollTo({top:0, behavior:'smooth'});">
                        <div class="logo-icon">ðŸŽ¬ MovieVerse</div>
                        <span class="logo-tag">4K UHD</span>
                    </div>
                    <div class="searchInput" id="search_toggle">
                        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        <input type="text" placeholder="Search 50,000+ Movies, Series, Anime..." id="movieSearchInput" onkeydown="handleSearch(event)">
                    </div>
                    <div class="header-actions">
                        <button class="vip-btn" onclick="openVipModal();">
                            <span>â­ VIP PASS</span>
                        </button>
                    </div>
                </div>

                <div class="tm_header_main_menu" id="paidSites">
                    <div class="tm_paid_tab active">FEATURED</div>
                    <div class="tm_paid_tab">HOLLYWOOD</div>
                    <div class="tm_paid_tab">BOLLYWOOD</div>
                    <div class="tm_paid_tab">WEB SERIES</div>
                    <div class="tm_paid_tab">TOP 100 IMDB</div>
                    <div class="tm_paid_tab">ANIME</div>
                    <div class="tm_paid_tab">4K ULTRA HD</div>
                </div>
            </header>

            <!-- Main Page Content -->
            <div class="tm_main_content" id="mobileContainer">
                
                <!-- In-page Top Ad Container -->
                <div class="ad-container-box" id="jyad-1-in-wrap">
                    <span class="ad-label">Advertisement</span>
                    <center id="jyad-1-in"></center>
                </div>

                <!-- Genre Pills -->
                <div class="categoriesWrapper">
                    <div class="categories-tags active">All Genres</div>
                    <div class="categories-tags">Action</div>
                    <div class="categories-tags">Sci-Fi</div>
                    <div class="categories-tags">Marvel Studios</div>
                    <div class="categories-tags">Adventure</div>
                    <div class="categories-tags">Thriller</div>
                    <div class="categories-tags">Horror</div>
                    <div class="categories-tags">Comedy</div>
                    <div class="categories-tags">Drama</div>
                    <div class="categories-tags">Dual Audio</div>
                    <div class="categories-tags">South Dubbed</div>
                </div>

                <!-- Video Watch Card -->
                <div class="watch-contentWrapper">
                    <div class="topTitleWrap">
                        <div class="movie-meta-bar">
                            <span class="badge-imdb">â˜… 8.8 IMDb</span>
                            <span class="badge-quality">4K ULTRA HD</span>
                            <span class="badge-meta">2024</span>
                            <span class="badge-meta">â€¢</span>
                            <span class="badge-meta">2h 12m</span>
                            <span class="badge-meta">â€¢</span>
                            <span class="badge-audio">Dolby Atmos 7.1</span>
                            <span class="badge-meta">â€¢</span>
                            <span class="badge-meta">Dual Audio [Hindi + Eng]</span>
                        </div>
                        <h1 class="videoTitle tm_videoTitle" id="randomtitle5">
                            Deadpool &amp; Wolverine (2024) Dual Audio [Hindi + Eng] 4K UHD HDRip 2160p
                        </h1>
                    </div>

                    <!-- In-page Mid Ad Container -->
                    <div class="ad-container-box" id="jyad-2-in-wrap" style="margin: 0; border-radius: 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span class="ad-label">Sponsored</span>
                        <center id="jyad-2-in"></center>
                    </div>

                    <div id="textcontent-div-1" style="text-align:center; padding: 6px 12px; font-size: 13px; color: #64748b;"></div>

                    <!-- Streaming Server Switcher & Video Link Control Bar -->
                    <div class="server-switcher-bar">
                        <div class="server-buttons-group">
                            <span class="server-label">SERVER:</span>
                            <button class="server-btn active" data-server="1" onclick="switchServer(1, this);">âš¡ Server 1 [VIP 4K]</button>
                            <button class="server-btn" data-server="2" onclick="switchServer(2, this);">ðŸš€ Server 2 [Fast CDN]</button>
                            <button class="server-btn" data-server="3" onclick="switchServer(3, this);">ðŸŽ¬ Server 3 [Multi-Audio]</button>
                            <button class="server-btn" data-server="4" onclick="switchServer(4, this);">ðŸŒ Server 4 [StreamSB]</button>
                        </div>
                        <button class="custom-link-btn" onclick="openCustomLinkModal();">
                            <span>ðŸ”— Add / Change Video Link</span>
                        </button>
                    </div>

                    <!-- Video Player Container -->
                    <div class="playWrapper tm_playWrapper" id="playWrapper">
                        <video id="videoplayer" playsinline preload="metadata">
                            <source id="videoSource" src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" type="video/mp4"/>
                            Your browser does not support HTML5 video.
                        </video>

                        <!-- Custom Big Play Button Overlay -->
                        <div id="playOverlayBtn" class="play-overlay-center" onclick="handlePlayButtonClick();">
                            <div class="big-play-icon">
                                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                            <div class="play-overlay-text">Click to Play 4K Stream</div>
                        </div>

                        <!-- 30-Second Preview Timer Badge -->
                        <div id="previewBadgeContainer" class="preview-badge-container">
                            <span id="previewTimerBadge">â± Preview: 00:30 / 00:30</span>
                            <div class="preview-progress-track">
                                <div id="previewProgressBar" class="preview-progress-bar"></div>
                            </div>
                        </div>

                        <!-- 30-Second Preview Expired Paywall Overlay -->
                        <div id="previewLockedOverlay" class="preview-locked-overlay">
                            <div class="locked-card">
                                <div class="locked-icon">ðŸ”’</div>
                                <h3>30-Second Preview Ended</h3>
                                <p>You have reached the free 30-second preview limit. Unlock full unlimited 4K streaming or switch to another server.</p>
                                <div class="locked-actions">
                                    <button class="locked-btn replay-btn" onclick="replayPreview();">ðŸ”„ Replay Preview (30s)</button>
                                    <button class="locked-btn vip-btn" onclick="openVipModal();">â­ Unlock VIP 4K</button>
                                </div>
                            </div>
                        </div>

                        <!-- Invisible Ad Manager Overlay over Play Button -->
                        <div id="floatads1" onclick="handleAdOverlayClick();" class="invisible-ad-overlay">
                            <div id="jyad-1" class="gpt-ad-slot"></div>
                        </div>
                    </div>

                    <!-- Video Action Bar -->
                    <div class="watch-metadata">
                        <div class="action-group">
                            <div class="action-btn" id="likeBtn" onclick="toggleLike();">
                                <span>ðŸ‘</span>
                                <span id="randomrating1">284K</span>
                            </div>
                            <div class="action-btn" id="dislikeBtn" onclick="toggleDislike();">
                                <span>ðŸ‘Ž</span>
                            </div>
                            <div class="action-btn">
                                <span>ðŸ‘</span>
                                <span id="randomviews1">3.8M Views</span>
                            </div>
                        </div>
                        <div class="action-group">
                            <button class="action-btn download-btn" onclick="openDownloadModal();">
                                <span>ðŸ“¥ Download 4K</span>
                            </button>
                            <button class="action-btn" onclick="toggleWatchlist(this);">
                                <span>â¤ï¸ Watchlist</span>
                            </button>
                            <button class="action-btn" onclick="shareMovie();">
                                <span>â†— Share</span>
                            </button>
                        </div>
                    </div>

                    <!-- Movie Synopsis -->
                    <div class="movie-info-box">
                        <p>
                            Six years after the events of Deadpool 2, Wade Wilson lives a quiet life having left his time as the mercenary Deadpool behind. When the Time Variance Authority (TVA) pulls him into a new mission to save his universe, he reluctantly teams up with an even more reluctant Wolverine on an unforgettable multiverse journey.
                        </p>
                        <div class="movie-info-grid">
                            <div class="movie-info-row">
                                <span class="movie-info-label">Director:</span>
                                <span class="movie-info-val">Shawn Levy</span>
                            </div>
                            <div class="movie-info-row">
                                <span class="movie-info-label">Stars:</span>
                                <span class="movie-info-val">Ryan Reynolds, Hugh Jackman, Emma Corrin</span>
                            </div>
                            <div class="movie-info-row">
                                <span class="movie-info-label">Audio:</span>
                                <span class="movie-info-val">Hindi [Clean HQ 5.1], English [Atmos], Tamil, Telugu</span>
                            </div>
                            <div class="movie-info-row">
                                <span class="movie-info-label">Subtitles:</span>
                                <span class="movie-info-val">English [SDH], Hindi, Spanish, French</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="textcontent-div-2" style="text-align:center;"></div>
                
                <!-- In-page Mid-Grid Ad Container -->
                <div class="ad-container-box" id="jyad-3-in-wrap">
                    <span class="ad-label">Advertisement</span>
                    <center id="jyad-3-in"></center>
                </div>

                <!-- Related / Trending Movies Section -->
                <div class="section-header">
                    <h2 class="section-title">Trending Movies &amp; Box Office Hits</h2>
                </div>

                <div id="textcontent-div-3" style="text-align:center;"></div>

                <!-- Grid of Movies (thumb-image targets) -->
                <div class="movie-grid" id="relatedVideos1234">
                    <!-- Movie 1 -->
                    <div class="movie-card js_video-box" data-id="1" data-title="Deadpool & Wolverine (2024)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="1" id="randomimage1" src="https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg" alt="Deadpool &amp; Wolverine" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.8</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration" id="randomsecond1">2h 08m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title" id="randomtitle1">Deadpool &amp; Wolverine (2024) [Dual Audio]</div>
                            <div class="movie-card-meta">
                                <span>2024</span>
                                <span>Action, Sci-Fi</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 2 -->
                    <div class="movie-card js_video-box" data-id="2" data-title="Dune: Part Two (2024)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="2" id="randomimage2" src="https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg" alt="Dune: Part Two" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.6</div>
                            <div class="card-badge-quality">IMAX 4K</div>
                            <div class="card-badge-duration" id="randomsecond2">2h 46m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title" id="randomtitle2">Dune: Part Two (2024) [Hindi + Eng]</div>
                            <div class="movie-card-meta">
                                <span>2024</span>
                                <span>Sci-Fi, Adventure</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 3 -->
                    <div class="movie-card js_video-box" data-id="3" data-title="Oppenheimer (2023)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="3" id="randomimage3" src="https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg" alt="Oppenheimer" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.9</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration" id="randomsecond3">3h 00m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title" id="randomtitle3">Oppenheimer (2023) Multi-Audio 4K</div>
                            <div class="movie-card-meta">
                                <span>2023</span>
                                <span>Biography, Drama</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 4 -->
                    <div class="movie-card js_video-box" data-id="4" data-title="Spider-Man: Across the Spider-Verse" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="4" id="randomimage4" src="https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg" alt="Spider-Man Across the Spider-Verse" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.7</div>
                            <div class="card-badge-quality">1080p FHD</div>
                            <div class="card-badge-duration" id="randomsecond4">2h 20m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title" id="randomtitle4">Spider-Man: Across the Spider-Verse</div>
                            <div class="movie-card-meta">
                                <span>2023</span>
                                <span>Animation, Action</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 5 -->
                    <div class="movie-card js_video-box" data-id="5" data-title="John Wick: Chapter 4 (2023)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="5" id="randomimage5" src="https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg" alt="John Wick: Chapter 4" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.4</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration">2h 49m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title">John Wick: Chapter 4 (2023) [Dual Audio]</div>
                            <div class="movie-card-meta">
                                <span>2023</span>
                                <span>Action, Thriller</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 6 -->
                    <div class="movie-card js_video-box" data-id="6" data-title="Gladiator II (2024)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="6" id="randomimage6" src="https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg" alt="Gladiator II" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.1</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration">2h 28m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title">Gladiator II (2024) Extended Cut</div>
                            <div class="movie-card-meta">
                                <span>2024</span>
                                <span>Action, Drama</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 7 -->
                    <div class="movie-card js_video-box" data-id="7" data-title="Interstellar Remastered (2014)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="7" id="randomimage7" src="https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg" alt="Interstellar" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.9</div>
                            <div class="card-badge-quality">IMAX 4K</div>
                            <div class="card-badge-duration">2h 49m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title">Interstellar (10th Anniversary Remaster)</div>
                            <div class="movie-card-meta">
                                <span>2014</span>
                                <span>Sci-Fi, Adventure</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie 8 -->
                    <div class="movie-card js_video-box" data-id="8" data-title="Avatar: The Way of Water (2022)" data-video="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="8" id="randomimage8" src="https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg" alt="Avatar: The Way of Water" loading="lazy"/>
                            <div class="card-badge-rating">â˜… 8.2</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration">3h 12m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>
                        </div>
                        <div class="movie-card-body">
                            <div class="movie-card-title tm_video_title">Avatar: The Way of Water (2022)</div>
                            <div class="movie-card-meta">
                                <span>2022</span>
                                <span>Sci-Fi, Adventure</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bottom In-page Ad Containers -->
                <div class="ad-container-box" id="jyad-4-in-wrap">
                    <span class="ad-label">Sponsored Content</span>
                    <center id="jyad-4-in"></center>
                </div>
                <div class="ad-container-box" id="jyad-5-in-wrap">
                    <span class="ad-label">Advertisement</span>
                    <center id="jyad-5-in"></center>
                </div>

                <div id="textcontent-div-4" style="text-align:center;"></div>
                <div id="textcontent-div-5" style="text-align:center;"></div>
                <div id="textcontent-div-6" style="text-align:center;"></div>
            </div>

            <!-- Footer -->
            <footer class="site-footer">
                <p><strong>MovieVerse</strong> &copy; 2026 - Stream High-Definition 4K Movies &amp; Web Series Online.</p>
                <p>Disclaimer: This site does not host any media files on its servers. All contents are provided by non-affiliated third-party providers.</p>
            </footer>

            <!-- Secondary Invisible Ad Slots (Optional GPT placement) -->
            <div id="floatads2" onclick="handleAdOverlayClick();" style="display:none;position:absolute;opacity:0;pointer-events:none;"><center id="jyad-2"></center></div>
            <div id="floatads3" onclick="handleAdOverlayClick();" style="display:none;position:absolute;opacity:0;pointer-events:none;"><center id="jyad-3"></center></div>
            <div id="floatads4" onclick="handleAdOverlayClick();" style="display:none;position:absolute;opacity:0;pointer-events:none;"><center id="jyad-4"></center></div>
            <div id="floatads5" onclick="handleAdOverlayClick();" style="display:none;position:absolute;opacity:0;pointer-events:none;"><center id="jyad-5"></center></div>
        </div>
    </div>

    <!-- MODAL 1: Custom Video Player Link Modal -->
    <div id="customLinkModal" class="modal-backdrop" onclick="closeModalOnBackdrop(event, 'customLinkModal');">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title">ðŸ”— Enter Video Player Link</div>
                <button class="modal-close-btn" onclick="closeModal('customLinkModal');">&times;</button>
            </div>
            <div class="modal-body">
                <p style="font-size: 13px; color: #94a3b8;">Paste direct video link (MP4, WebM, HLS M3U8, or CDN stream) to play in 4K UHD player:</p>
                <input type="text" id="customVideoInput" class="modal-input" placeholder="https://example.com/video-stream.mp4" value="" />
                
                <div class="preset-links-group">
                    <span class="preset-title">Or Choose Quick Preset Demo:</span>
                    <div class="preset-chip" onclick="applyPresetVideo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 'Deadpool & Wolverine (2024) [4K Stream]');">
                        <span>ðŸŽ¬ Tears of Steel (Sci-Fi 4K HDR)</span>
                        <span style="color: #10b981; font-weight:700;">Select</span>
                    </div>
                    <div class="preset-chip" onclick="applyPresetVideo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'Dune: Part Two (2024) [IMAX Stream]');">
                        <span>ðŸ° Big Buck Bunny (Animation 4K)</span>
                        <span style="color: #10b981; font-weight:700;">Select</span>
                    </div>
                    <div class="preset-chip" onclick="applyPresetVideo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 'Oppenheimer (2023) [Dolby Atmos]');">
                        <span>ðŸ˜ Elephant\\'s Dream (Sci-Fi Classic)</span>
                        <span style="color: #10b981; font-weight:700;">Select</span>
                    </div>
                </div>

                <button class="modal-submit-btn" onclick="submitCustomVideoLink();">âš¡ Load &amp; Stream Video</button>
            </div>
        </div>
    </div>

    <!-- MODAL 2: VIP Pass Modal -->
    <div id="vipModal" class="modal-backdrop" onclick="closeModalOnBackdrop(event, 'vipModal');">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title">â­ MovieVerse VIP Pass</div>
                <button class="modal-close-btn" onclick="closeModal('vipModal');">&times;</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; padding: 10px 0;">
                    <div style="font-size: 42px; margin-bottom: 8px;">ðŸ‘‘</div>
                    <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">Unlock Unlimited 4K Cinema</h3>
                    <p style="font-size: 13.5px; color: #94a3b8;">Stream all 50,000+ movies & web series with zero interruptions, Dolby Atmos, and ultra-fast dedicated CDN servers.</p>
                </div>
                <button class="modal-submit-btn" onclick="unlockVipDemo();">ðŸš€ Activate Instant VIP Access</button>
            </div>
        </div>
    </div>

    <!-- MODAL 3: Download Quality Modal -->
    <div id="downloadModal" class="modal-backdrop" onclick="closeModalOnBackdrop(event, 'downloadModal');">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title">ðŸ“¥ Download 4K / HD Video</div>
                <button class="modal-close-btn" onclick="closeModal('downloadModal');">&times;</button>
            </div>
            <div class="modal-body">
                <span class="preset-title">Select Download Resolution:</span>
                <div class="preset-chip" onclick="triggerDownloadFile('4K UHD [2160p] - 12.4 GB');">
                    <span>ðŸŽ¬ 4K Ultra HD (2160p) [x265 10-Bit]</span>
                    <span style="color:#38bdf8;font-weight:700;">12.4 GB</span>
                </div>
                <div class="preset-chip" onclick="triggerDownloadFile('Full HD [1080p] - 3.8 GB');">
                    <span>ðŸŽ¥ Full HD (1080p) [Dual Audio 5.1]</span>
                    <span style="color:#10b981;font-weight:700;">3.8 GB</span>
                </div>
                <div class="preset-chip" onclick="triggerDownloadFile('HD [720p] - 1.2 GB');">
                    <span>ðŸ“± HD (720p) [Mobile Optimized]</span>
                    <span style="color:#fbbf24;font-weight:700;">1.2 GB</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Toast Notification Element -->
    <div id="toastMessage" class="toast-msg"></div>

    <!-- SCRIPTS -->
    <script>
        // =========================================================================
        // WORDPRESS REDIRECTION & COOKIE HELPERS
        // =========================================================================
        function setCookie(name, value, hours) {
            let expires = "";
            if (hours) {
                const date = new Date();
                date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
                expires = "; expires=" + date.toUTCString();
            }
            document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
        }

        function getCookie(name) {
            const nameEQ = name + "=";
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                let c = cookies[i].trim();
                if (c.indexOf(nameEQ) === 0) {
                    return decodeURIComponent(c.substring(nameEQ.length));
                }
            }
            return null;
        }

        function showToast(msg) {
            const toast = document.getElementById("toastMessage");
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add("show");
            setTimeout(() => {
                toast.classList.remove("show");
            }, 3000);
        }

        // =========================================================================
        // GOOGLE AD MANAGER (GPT) - ONLY AD MANAGER (NO ADSENSE)
        // =========================================================================
        let divIds = ['jyad-1', 'jyad-2', 'jyad-3', 'jyad-4', 'jyad-5'];
        let divIdsIn = ['jyad-1-in', 'jyad-2-in', 'jyad-3-in', 'jyad-4-in', 'jyad-5-in'];
        
        let gptUnits = [{
            path: '/23332666651/adx1',
            sizes: [[300, 250], [320, 480], [336, 280], [320, 50], [728, 90]]
        }, {
            path: '/23332666651/adx2',
            sizes: [[300, 250], [320, 50], [336, 280], [728, 90]]
        }, {
            path: '/23332666651/adx3',
            sizes: [[336, 280], [300, 250], [320, 480], [728, 90]]
        }, {
            path: '/23332666651/adx4',
            sizes: [[300, 250], [320, 50], [336, 280]]
        }, {
            path: '/23332666651/adx5',
            sizes: [[300, 250], [320, 50], [336, 280]]
        }];

        function shuffle(array) {
            const a = array.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        function loadGPTScript() {
            return new Promise((resolve, reject) => {
                if (document.querySelector('script[src*="gpt.js"]')) {
                    resolve();
                    return;
                }
                const s = document.createElement('script');
                s.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
                s.async = true;
                s.crossOrigin = "anonymous";
                s.onload = resolve;
                s.onerror = () => reject(new Error("Failed to load Google Ad Manager"));
                document.head.appendChild(s);
            });
        }

        function createGPTUnit(divId, unit) {
            const targetEl = document.getElementById(divId);
            if (!targetEl) return;
            window.googletag = window.googletag || { cmd: [] };
            googletag.cmd.push(function() {
                try {
                    googletag.defineSlot(unit.path, unit.sizes, divId).addService(googletag.pubads());
                    googletag.pubads().enableSingleRequest();
                    googletag.enableServices();
                    googletag.display(divId);
                } catch (e) {
                    console.warn("[GPT Display Error]", e);
                }
            });
        }

        async function initGoogleAdManager() {
            try {
                await loadGPTScript();
            } catch (e) {
                console.warn("[Ad Manager Script Load]", e);
            }

            const hasAdClicked = sessionStorage.getItem("adclk") === "1";
            
            // If already clicked, invisible ad overlay on player is removed, load into in-page containers
            if (hasAdClicked) {
                const fa1 = document.getElementById("floatads1");
                if (fa1) fa1.style.display = "none";

                for (let i = 0; i < divIdsIn.length; i++) {
                    const dId = divIdsIn[i];
                    const unit = gptUnits[i % gptUnits.length];
                    createGPTUnit(dId, unit);
                }
            } else {
                // First load: ad is rendered into invisible overlay (#floatads1 / jyad-1) over play button
                createGPTUnit('jyad-1', gptUnits[0]);
                // Secondary in-page units
                createGPTUnit('jyad-2-in', gptUnits[1]);
                createGPTUnit('jyad-3-in', gptUnits[2]);
            }
        }

        // =========================================================================
        // INVISIBLE AD CLICK & PLAY BUTTON MECHANICS
        // =========================================================================
        function handleAdOverlayClick() {
            sessionStorage.setItem("adclk", "1");
            setCookie("wdchange", "true", 19);

            // Hide the invisible ad overlay immediately so controls are unlocked
            const fa1 = document.getElementById("floatads1");
            if (fa1) fa1.style.display = "none";

            // Hide the center big play button
            const playOverlay = document.getElementById("playOverlayBtn");
            if (playOverlay) playOverlay.style.display = "none";

            // Trigger video playback
            startVideoPlayback();
        }

        function handlePlayButtonClick() {
            const hasAdClicked = sessionStorage.getItem("adclk") === "1";
            if (!hasAdClicked) {
                // If ad hasn't been clicked, trigger ad click
                handleAdOverlayClick();
            } else {
                const playOverlay = document.getElementById("playOverlayBtn");
                if (playOverlay) playOverlay.style.display = "none";
                startVideoPlayback();
            }
        }

        function startVideoPlayback() {
            const video = document.getElementById("videoplayer");
            if (video) {
                video.controls = true;
                video.play().catch(err => {
                    console.log("[Autoplay Info]", err);
                });
            }
        }

        // =========================================================================
        // 30-SECOND PREVIEW PLAYBACK LIMIT LOGIC
        // =========================================================================
        const PREVIEW_LIMIT = 30; // 30 seconds preview limit
        const video = document.getElementById("videoplayer");
        const timerBadge = document.getElementById("previewTimerBadge");
        const progressBar = document.getElementById("previewProgressBar");
        const lockedOverlay = document.getElementById("previewLockedOverlay");

        if (video) {
            video.addEventListener("timeupdate", function() {
                const cur = video.currentTime;
                
                // Update countdown badge
                if (timerBadge) {
                    const remaining = Math.max(0, Math.ceil(PREVIEW_LIMIT - cur));
                    const remStr = remaining < 10 ? '0' + remaining : remaining;
                    timerBadge.textContent = \`â± Preview: 00:\${remStr} / 00:30\`;
                }

                // Update progress bar
                if (progressBar) {
                    const pct = Math.min(100, (cur / PREVIEW_LIMIT) * 100);
                    progressBar.style.width = pct + "%";
                }

                // Enforce 30-second stop & show paywall
                if (cur >= PREVIEW_LIMIT) {
                    video.pause();
                    video.currentTime = PREVIEW_LIMIT;
                    if (lockedOverlay) {
                        lockedOverlay.style.display = "flex";
                    }
                }
            });

            // Prevent user from seeking past 30 seconds during preview
            video.addEventListener("seeking", function() {
                if (video.currentTime > PREVIEW_LIMIT) {
                    video.currentTime = PREVIEW_LIMIT;
                    video.pause();
                    if (lockedOverlay) {
                        lockedOverlay.style.display = "flex";
                    }
                }
            });
        }

        function replayPreview() {
            if (lockedOverlay) lockedOverlay.style.display = "none";
            if (video) {
                video.currentTime = 0;
                video.play().catch(e => {});
            }
        }

        // =========================================================================
        // VIDEO PLAYER LINK LOADER & SERVER SWITCHER
        // =========================================================================
        const serverSources = {
            1: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
            2: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            3: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
            4: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
        };

        function switchServer(serverNum, btnEl) {
            document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');

            const url = serverSources[serverNum] || serverSources[1];
            loadCustomVideo(url, null, false);
            showToast(\`Switched to Server \${serverNum} [Ultra HD]\`);
        }

        function loadCustomVideo(url, title, autoPlay = true) {
            if (!url || !video) return;
            
            const sourceEl = document.getElementById("videoSource");
            if (sourceEl) sourceEl.src = url;
            video.src = url;
            video.load();
            video.currentTime = 0;

            if (lockedOverlay) lockedOverlay.style.display = "none";
            if (progressBar) progressBar.style.width = "0%";
            if (timerBadge) timerBadge.textContent = "â± Preview: 00:30 / 00:30";

            if (title) {
                const titleEl = document.getElementById("randomtitle5");
                if (titleEl) titleEl.textContent = title;
            }

            if (autoPlay) {
                const playOverlay = document.getElementById("playOverlayBtn");
                if (playOverlay) playOverlay.style.display = "none";
                video.controls = true;
                video.play().catch(e => {});
            }
        }

        function openCustomLinkModal() {
            document.getElementById("customLinkModal").style.display = "flex";
            const input = document.getElementById("customVideoInput");
            if (input) {
                input.value = video.currentSrc || video.src || "";
                input.focus();
            }
        }

        function applyPresetVideo(url, title) {
            const input = document.getElementById("customVideoInput");
            if (input) input.value = url;
            loadCustomVideo(url, title, true);
            closeModal('customLinkModal');
            showToast("Video loaded successfully!");
        }

        function submitCustomVideoLink() {
            const input = document.getElementById("customVideoInput");
            if (!input || !input.value.trim()) {
                alert("Please enter a valid video URL");
                return;
            }
            const cleanUrl = input.value.trim();
            loadCustomVideo(cleanUrl, "Custom Stream Video (4K UHD)", true);
            closeModal('customLinkModal');
            showToast("Custom video link loaded!");
        }

        // Check URL parameters for custom video stream (?v=... or ?video=...)
        try {
            const qParams = new URLSearchParams(window.location.search);
            const customParamUrl = qParams.get("v") || qParams.get("video") || qParams.get("stream");
            if (customParamUrl) {
                loadCustomVideo(customParamUrl, qParams.get("title") || "Custom Video Stream (4K UHD)", false);
            }
        } catch (e) {}

        // =========================================================================
        // MODALS & ACTIONS HELPERS
        // =========================================================================
        function closeModal(modalId) {
            const m = document.getElementById(modalId);
            if (m) m.style.display = "none";
        }

        function closeModalOnBackdrop(e, modalId) {
            if (e.target && e.target.id === modalId) {
                closeModal(modalId);
            }
        }

        function openVipModal() {
            document.getElementById("vipModal").style.display = "flex";
        }

        function unlockVipDemo() {
            closeModal('vipModal');
            showToast("ðŸŽ‰ VIP Access Activated! Unlimited 4K Streaming Unlocked.");
            if (lockedOverlay) lockedOverlay.style.display = "none";
            if (video) {
                video.currentTime = 0;
                video.play().catch(e => {});
            }
        }

        function openDownloadModal() {
            document.getElementById("downloadModal").style.display = "flex";
        }

        function triggerDownloadFile(res) {
            closeModal('downloadModal');
            showToast(\`Starting download: \${res}\`);
            setTimeout(() => {
                const a = document.createElement("a");
                a.href = video.currentSrc || video.src || "#";
                a.download = "Deadpool_Wolverine_4K.mp4";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, 600);
        }

        let isLiked = false;
        function toggleLike() {
            isLiked = !isLiked;
            const btn = document.getElementById("likeBtn");
            const rating = document.getElementById("randomrating1");
            if (btn) btn.classList.toggle("active", isLiked);
            if (rating) rating.textContent = isLiked ? "285K" : "284K";
            showToast(isLiked ? "Added to your Liked videos" : "Removed like");
        }

        function toggleDislike() {
            const btn = document.getElementById("dislikeBtn");
            if (btn) btn.classList.toggle("active");
            showToast("Feedback submitted");
        }

        function toggleWatchlist(btn) {
            btn.classList.toggle("active");
            const isAdded = btn.classList.contains("active");
            showToast(isAdded ? "Added to your Watchlist â¤ï¸" : "Removed from Watchlist");
        }

        function shareMovie() {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
                showToast("ðŸ”— Link copied to clipboard!");
            } else {
                showToast("Share this link with your friends!");
            }
        }

        function handleSearch(e) {
            if (e.key === "Enter") {
                const val = e.target.value.trim();
                if (val) {
                    showToast(\`Searching for: "\${val}"\`);
                }
            }
        }

        // =========================================================================
        // RANDOM WORDPRESS REDIRECTION ON RELATED CARD CLICKS
        // =========================================================================
        function getRandomTargetUrl() {
            let pool = (window.__wp_posts && window.__wp_posts.length > 0) ? window.__wp_posts : [];
            if (!pool || pool.length === 0) {
                try {
                    const cached = sessionStorage.getItem("wp_posts_cache");
                    if (cached) pool = JSON.parse(cached);
                } catch (e) {}
            }
            if (Array.isArray(pool) && pool.length > 0) {
                const current = window.location.href.split('?')[0].replace(/\\/+$/, '');
                const filtered = pool.filter(u => typeof u === 'string' && u.split('?')[0].replace(/\\/+$/, '') !== current);
                const finalPool = filtered.length > 0 ? filtered : pool;
                return finalPool[Math.floor(Math.random() * finalPool.length)];
            }
            return window.location.origin + '/';
        }

        const movieCards = document.querySelectorAll('.movie-card');
        movieCards.forEach(card => {
            card.addEventListener('click', function(e) {
                const click_id = this.getAttribute('data-id') || "1";
                const cardVideo = this.getAttribute('data-video');
                const cardTitle = this.getAttribute('data-title');
                
                setCookie("jpid", click_id, 9);

                // If preview mode, load the selected movie trailer into player & scroll up smoothly
                const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
                if (isPreview && cardVideo) {
                    loadCustomVideo(cardVideo, cardTitle, true);
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                    return;
                }

                // Check if session has expired after 60 seconds
                const exp = parseInt(sessionStorage.getItem("jcfdtime") || "0", 10);
                if (exp && Date.now() > exp) {
                    sessionStorage.removeItem("jcfdtime");
                    sessionStorage.removeItem("jcfd");
                    const targetUrl = getRandomTargetUrl();
                    if (targetUrl) {
                        window.location.href = targetUrl;
                        return;
                    }
                }

                // In production mode, redirect to WordPress post
                const targetUrl = getRandomTargetUrl();
                if (targetUrl && targetUrl !== window.location.origin + '/') {
                    window.location.href = targetUrl;
                } else if (cardVideo) {
                    loadCustomVideo(cardVideo, cardTitle, true);
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                }
            });
        });

        // Filler dynamic texts
        const textArray = [
            "Experience the ultimate cinema thrill with 4K UHD streaming at lightning speeds.",
            "Watch thousands of trending Hollywood, Bollywood and Anime series anytime, anywhere.",
            "High-bitrate Dolby Atmos audio with multi-language dubbing and crystal-clear subtitles.",
            "Instant buffer-free streaming supported across mobile, tablet, desktop and Smart TV.",
            "Download full episodes and blockbuster movies in 480p, 720p, 1080p FHD and 4K UHD.",
            "Updated daily with newly released theatrical blockbusters and exclusive digital premieres."
        ];
        for (let i = 1; i <= 6; i++) {
            const el = document.getElementById(\`textcontent-div-\${i}\`);
            if (el) {
                el.textContent = textArray[(i - 1) % textArray.length];
            }
        }

        // =========================================================================
        // 60-SECOND SESSION ACTIVE TIMER & AUTOMATIC EXPIRATION HANDLER
        // =========================================================================
        (function setupSessionExpiryTimer() {
            const isPreview = new URLSearchParams(window.location.search).get("preview") === "1" || 
                              new URLSearchParams(window.location.search).get("movieverse") === "1";
            if (isPreview) return; // Keep persistent in preview mode for developer testing

            const expTimeStr = sessionStorage.getItem("jcfdtime");
            if (!expTimeStr) return;

            const expTime = parseInt(expTimeStr, 10);
            const remainingMs = expTime - Date.now();

            function expireSessionNow() {
                // Clear active session keys
                sessionStorage.removeItem("jcfdtime");
                sessionStorage.removeItem("jcfd");

                // Automatically redirect to original WordPress post or reload to restore original site
                const targetUrl = getRandomTargetUrl();
                if (targetUrl && targetUrl !== window.location.origin + '/') {
                    window.location.href = targetUrl;
                } else {
                    window.location.reload();
                }
            }

            if (remainingMs <= 0) {
                expireSessionNow();
            } else {
                setTimeout(expireSessionNow, remainingMs);
            }
        })();

        // Initialize Ad Manager
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initGoogleAdManager);
        } else {
            initGoogleAdManager();
        }
    </script>
</body>
</html>`);
    }
})();
