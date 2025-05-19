import express, { Request, Response } from 'express';
import path from 'path';
import open from 'open';
import { getAuthUrl, getAccessToken, loadToken, oAuth2Client } from './oauth2';
import { google, youtube_v3 } from 'googleapis';

const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // For parsing application/json

// Load token if available
loadToken();

/**
 * Check if a string contains Unicode characters
 */
function containsUnicode(text: string): boolean {
  // Check for non-ASCII characters
  return /[^\u0000-\u007F]/.test(text);
}

/**
 * Highlight Unicode characters in a string
 */
function highlightUnicode(text: string): string {
  return text.replace(/[^\u0000-\u007F]/g, match => 
    `<span class="unicode-highlight">${match}</span>`);
}

/**
 * Fetch videos from authenticated user's channel
 */
async function fetchUserVideos(): Promise<any[]> {
  if (!oAuth2Client) {
    console.error('❌ Authentication required');
    return [];
  }
  
  try {
    const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
    
    // First get the authenticated user's channel ID
    const meResponse = await youtube.channels.list({
      part: ['id', 'snippet'],
      mine: true
    });
    
    if (!meResponse.data.items || meResponse.data.items.length === 0) {
      console.error('❌ No channel found for authenticated user');
      return [];
    }
    
    const channelId = meResponse.data.items[0].id;
    
    // Now get the user's uploads
    const videosResponse = await youtube.search.list({
      part: ['snippet'],
      channelId: channelId,
      maxResults: 50,
      order: 'date',
      type: ['video']
    });
    
    if (!videosResponse.data.items) {
      return [];
    }
    
    // Format video data
    const videos = videosResponse.data.items.map(item => {
      const snippet = item.snippet;
      return {
        id: item.id?.videoId,
        title: snippet?.title || 'Untitled Video',
        thumbnail: snippet?.thumbnails?.medium?.url || '',
        description: snippet?.description || '',
        date: snippet?.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString() : 'Unknown',
        views: 'N/A' // YouTube API v3 requires a separate call to get view counts
      };
    });
    
    return videos;
  } catch (error) {
    console.error('❌ Error fetching videos:', error);
    return [];
  }
}

/**
 * Fetch comments for a video, filtering for Unicode characters
 */
async function fetchCommentsWithUnicode(videoId: string, filter: string = 'all'): Promise<any[]> {
  if (!oAuth2Client) {
    console.error('❌ Authentication required');
    return [];
  }
  
  try {
    const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
    
    const response = await youtube.commentThreads.list({
      part: ['snippet', 'replies'],
      videoId: videoId,
      maxResults: 100
    });
    
    if (!response.data.items) {
      return [];
    }
    
    const allComments: any[] = [];
    
    // Process top-level comments
    for (const thread of response.data.items || []) {
      const topComment = thread.snippet?.topLevelComment?.snippet;
      
      if (topComment && containsUnicode(topComment.textDisplay || '')) {
        allComments.push({
          id: thread.snippet?.topLevelComment?.id || thread.id,
          author: topComment.authorDisplayName || 'Anonymous',
          text: topComment.textDisplay || '',
          highlightedText: highlightUnicode(topComment.textDisplay || ''),
          date: new Date(topComment.publishedAt || '').toLocaleString()
        });
      }
      
      // Process replies
      if (thread.replies?.comments) {
        for (const reply of thread.replies.comments) {
          if (reply.snippet && containsUnicode(reply.snippet.textDisplay || '')) {
            allComments.push({
              id: reply.id,
              author: reply.snippet.authorDisplayName || 'Anonymous',
              text: reply.snippet.textDisplay || '',
              highlightedText: highlightUnicode(reply.snippet.textDisplay || ''),
              date: new Date(reply.snippet.publishedAt || '').toLocaleString()
            });
          }
        }
      }
    }
    
    // Apply additional filtering based on the filter parameter
    let filteredComments = allComments;
    
    if (filter === 'emoji') {
      // Filter for comments containing emoji
      const emojiRegex = /[\u{1F000}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      filteredComments = allComments.filter(comment => emojiRegex.test(comment.text));
    } else if (filter === 'nonLatin') {
      // Filter for comments containing non-Latin scripts (e.g., Arabic, Chinese, Cyrillic, etc.)
      const nonLatinRegex = /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF\u1200-\u137F\u1380-\u139F\u13A0-\u13FF\u1400-\u167F\u1680-\u169F\u16A0-\u16FF\u1700-\u171F\u1720-\u173F\u1740-\u175F\u1760-\u177F\u1780-\u17FF\u1800-\u18AF\u1900-\u194F\u1950-\u197F\u1980-\u19DF\u19E0-\u19FF\u1A00-\u1A1F\u1A20-\u1AAF\u1B00-\u1B7F\u1B80-\u1BBF\u1BC0-\u1BFF\u1C00-\u1C4F\u1C50-\u1C7F\u1C80-\u1C8F\u1C90-\u1CBF\u1CC0-\u1CCF\u1CD0-\u1CFF\u1D00-\u1D7F\u1D80-\u1DBF\u1DC0-\u1DFF\u1E00-\u1EFF\u1F00-\u1FFF\u2C00-\u2C5F\u2C60-\u2C7F\u2C80-\u2CFF\u2D00-\u2D2F\u2D30-\u2D7F\u2D80-\u2DDF\u2DE0-\u2DFF\u2E00-\u2E7F\u2F00-\u2FDF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3130-\u318F\u3190-\u319F\u31A0-\u31BF\u31C0-\u31EF\u31F0-\u31FF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4DC0-\u4DFF\u4E00-\u9FFF\uA000-\uA48F\uA490-\uA4CF\uA4D0-\uA4FF\uA500-\uA63F\uA640-\uA69F\uA6A0-\uA6FF\uA700-\uA71F\uA720-\uA7FF\uA800-\uA82F\uA830-\uA83F\uA840-\uA87F\uA880-\uA8DF\uA8E0-\uA8FF\uA900-\uA92F\uA930-\uA95F\uA960-\uA97F\uA980-\uA9DF\uA9E0-\uA9FF\uAA00-\uAA5F\uAA60-\uAA7F\uAA80-\uAADF\uAAE0-\uAAFF\uAB00-\uAB2F\uAB30-\uAB6F\uAB70-\uABBF\uABC0-\uABFF\uAC00-\uD7AF\uD7B0-\uD7FF\uF900-\uFAFF\uFB00-\uFB4F\uFB50-\uFDFF\uFE00-\uFE0F\uFE10-\uFE1F\uFE20-\uFE2F\uFE30-\uFE4F\uFE50-\uFE6F\uFE70-\uFEFF\uFF00-\uFFEF\u{10000}-\u{10FFFF}]/u;
      filteredComments = allComments.filter(comment => nonLatinRegex.test(comment.text));
    } else if (filter === 'special') {
      // Filter for comments containing special characters
      const specialCharsRegex = /[\u2000-\u206F\u2100-\u214F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2400-\u243F\u2440-\u245F\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u27C0-\u27EF\u27F0-\u27FF\u2800-\u28FF\u2900-\u297F\u2980-\u29FF\u2A00-\u2AFF\u2B00-\u2BFF\u2E00-\u2E7F]/;
      filteredComments = allComments.filter(comment => specialCharsRegex.test(comment.text));
    }
    
    return filteredComments;
  } catch (error) {
    console.error('❌ Error fetching comments:', error);
    return [];
  }
}

/**
 * Delete a comment
 */
async function deleteComment(commentId: string): Promise<boolean> {
  if (!oAuth2Client) {
    console.error('❌ Authentication required');
    return false;
  }
  
  try {
    const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
    
    await youtube.comments.delete({
      id: commentId
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Error deleting comment ${commentId}:`, error);
    return false;
  }
}

/**
 * Mark a comment as spam
 */
async function reportComment(commentId: string): Promise<boolean> {
  if (!oAuth2Client) {
    console.error('❌ Authentication required');
    return false;
  }
  
  try {
    const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
    
    await youtube.comments.markAsSpam({
      id: commentId
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Error reporting comment ${commentId}:`, error);
    return false;
  }
}

/**
 * Home Page - Modern UI with authentication button.
 */
app.get('/', (_req: Request, res: Response) => {
  res.render('index', { authUrl: getAuthUrl() });
});

/**
 * Redirect user to Google OAuth login.
 */
app.get('/auth', async (_req: Request, res: Response) => {
  const authUrl = getAuthUrl();
  console.log(`🌐 Open this URL to authenticate: ${authUrl}`);

  await open(authUrl);
  
  res.render('auth', { authUrl });
});

/**
 * Handle Google OAuth callback and save credentials.
 */
app.get('/auth/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.render('error', { message: '❌ Invalid or missing authorization code.' });
  }

  try {
    await getAccessToken(code);
    res.render('success');
  } catch (error) {
    res.render('error', { message: '❌ Failed to authenticate.' });
  }
});

/**
 * Manage page - Show videos and comments with Unicode
 */
app.get('/manage', async (_req: Request, res: Response) => {
    if (!oAuth2Client) {
      return res.render('error', { 
        message: '❌ Authentication required. Please <a href="/auth">login</a> first.' 
      });
    }
    
    try {
      // Fetch user's videos
      const videos = await fetchUserVideos();
      
      // Render the page without any selected video initially
      res.render('manage', { 
        videos,
        comments: [],
        defaultVideoId: videos.length > 0 ? videos[0].id : null
      });
    } catch (error) {
      console.error('Error rendering manage page:', error);
      res.render('error', { message: '❌ Error loading videos. Please try again.' });
    }
  });
  
  /**
   * API endpoint to fetch comments with Unicode characters
   */
  app.get('/api/comments', async (req: Request, res: Response) => {
    const { videoId, filter = 'all' } = req.query;
    
    if (!videoId || typeof videoId !== 'string') {
      return res.json({
        success: false,
        message: 'Video ID is required'
      });
    }
    
    if (!oAuth2Client) {
      return res.json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    try {
      const comments = await fetchCommentsWithUnicode(videoId, filter as string);
      
      res.json({
        success: true,
        comments
      });
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.json({
        success: false,
        message: 'Failed to fetch comments'
      });
    }
  });
  
  /**
   * API endpoint to delete a comment
   */
  app.post('/api/comments/delete', async (req: Request, res: Response) => {
    const { commentId } = req.body;
    
    if (!commentId) {
      return res.json({
        success: false,
        message: 'Comment ID is required'
      });
    }
    
    try {
      const success = await deleteComment(commentId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Comment deleted successfully'
        });
      } else {
        res.json({
          success: false,
          message: 'Failed to delete comment'
        });
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.json({
        success: false,
        message: 'Error deleting comment'
      });
    }
  });
  
  /**
   * API endpoint to report a comment as spam
   */
  app.post('/api/comments/report', async (req: Request, res: Response) => {
    const { commentId } = req.body;
    
    if (!commentId) {
      return res.json({
        success: false,
        message: 'Comment ID is required'
      });
    }
    
    try {
      const success = await reportComment(commentId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Comment reported successfully'
        });
      } else {
        res.json({
          success: false,
          message: 'Failed to report comment'
        });
      }
    } catch (error) {
      console.error('Error reporting comment:', error);
      res.json({
        success: false,
        message: 'Error reporting comment'
      });
    }
  });
  
  /**
   * API endpoint to fetch user's videos
   */
  app.get('/api/videos', async (_req: Request, res: Response) => {
    if (!oAuth2Client) {
      return res.json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    try {
      const videos = await fetchUserVideos();
      
      res.json({
        success: true,
        videos
      });
    } catch (error) {
      console.error('Error fetching videos:', error);
      res.json({
        success: false,
        message: 'Failed to fetch videos'
      });
    }
  });
  
  /**
   * Start the Express server.
   */
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/`);
    console.log('🔑 Open this URL to start authentication: http://localhost:3000/auth');
  });