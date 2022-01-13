import React from "react";
import useSWR, { mutate } from "swr";
import {
  createSearchParams,
  Link,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import { Button } from "../../ui/atoms/button";

import { DISABLE_AUTH } from "../../constants";
import { AuthDisabled } from "../../ui/atoms/auth-disabled";
import { Loading } from "../../ui/atoms/loading";
import { useUserData } from "../../user-context";

import "./index.scss";
import { DataError, NotSignedIn, NotSubscriber } from "../common";

dayjs.extend(relativeTime);

interface Breadcrumb {
  uri: string;
  title: string;
}

interface BookmarkData {
  id: number;
  url: string;
  title: string;
  parents: Breadcrumb[];
  created: string;
}

interface BookmarksMetadata {
  page: number;
  total: number;
  per_page: number;
}

interface BookmarksData {
  items: BookmarkData[];
  metadata: BookmarksMetadata;
  csrfmiddlewaretoken: string;
}

const API_URL = "/api/v1/plus/bookmarks/";

export default function Bookmarks() {
  const userData = useUserData();
  const [searchParams, setSearchParams] = useSearchParams();

  const pageTitle = "My Bookmarks";
  React.useEffect(() => {
    document.title = pageTitle;
  }, []);

  const isSubscriber = userData && userData.isSubscriber;

  const apiURL = isSubscriber ? `${API_URL}?${searchParams.toString()}` : null;

  const { data, error } = useSWR<BookmarksData | null, Error | null>(
    apiURL,
    async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} on ${response.url}`);
      }
      const data = (await response.json()) as BookmarksData;
      return data;
    }
  );

  React.useEffect(() => {
    if (data && data.metadata.total > 0) {
      let newTitle = `${pageTitle} (${data.metadata.total})`;
      if (data.metadata.page > 1) {
        newTitle += ` Page ${data.metadata.page}`;
      }
      document.title = newTitle;
    }
  }, [data]);

  React.useEffect(() => {
    if (data) {
      // If you're on ?page=3 and the per_page number is 10 and you have
      // 31 bookmarks. If you delete the only bookmark there on page 3,
      // it no longer makes sense to be on that page. So we force a
      // change to `?page={3 - 1}`.
      if (data.metadata.page > 1 && data.items.length === 0) {
        const newSearchParams = createSearchParams(searchParams);
        if (data.metadata.page === 2) {
          newSearchParams.delete("page");
        } else {
          newSearchParams.set("page", `${data.metadata.page - 1}`);
        }
        setSearchParams(newSearchParams);
      }
    }
  }, [data, setSearchParams, searchParams]);

  async function saveBookmarked(url: string) {
    const sp = new URLSearchParams({
      url,
    });
    const apiPostURL = `${API_URL}?${sp.toString()}`;
    if (!data) {
      return false;
    }
    const response = await fetch(apiPostURL, {
      method: "POST",
      headers: {
        "X-CSRFToken": data.csrfmiddlewaretoken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    if (!response.ok) {
      throw new Error(`${response.status} on ${response.url}`);
    }
    mutate(apiURL);
    return true;
  }

  if (DISABLE_AUTH) {
    return <AuthDisabled />;
  }

  if (!userData) {
    return <Loading message="Waiting for authentication" />;
  } else if (!userData.isAuthenticated) {
    return <NotSignedIn />;
  } else if (!userData.isSubscriber) {
    return <NotSubscriber />;
  }

  if (error) {
    return <DataError error={error} />;
  } else if (!data) {
    return <Loading message="Waiting for data" />;
  }
  return <DisplayData data={data} saveBookmarked={saveBookmarked} />;
}

function DisplayData({
  data,
  saveBookmarked,
}: {
  data: BookmarksData;
  saveBookmarked: (url: string) => Promise<boolean>;
}) {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const [toggleError, setToggleError] = React.useState<Error | null>(null);
  const [unbookmarked, setUnbookmarked] = React.useState<BookmarkData | null>(
    null
  );

  React.useEffect(() => {
    let mounted = true;
    if (unbookmarked) {
      setTimeout(() => {
        if (mounted) {
          setUnbookmarked(null);
        }
      }, 5000);
    }
    return () => {
      mounted = false;
    };
  }, [unbookmarked]);

  const maxPage = Math.ceil(data.metadata.total / data.metadata.per_page);
  const nextPage =
    data.metadata.page + 1 <= maxPage ? data.metadata.page + 1 : 0;
  const previousPage = data.metadata.page - 1 > 0 ? data.metadata.page - 1 : 0;

  function getPaginationURL(page: number) {
    const sp = createSearchParams(searchParams);
    if (page === 1) {
      sp.delete("page");
    } else {
      sp.set("page", `${page}`);
    }
    if (sp.toString()) {
      return `${pathname}?${sp.toString()}`;
    }
    return pathname;
  }

  return (
    <>
      <h3>My Collection</h3>

      {data.metadata.total === 0 && (
        <p className="nothing-bookmarked">
          Nothing saved yet. Go out there and explore!
        </p>
      )}

      {toggleError && (
        <div className="notecard negative">
          <h3>Server error</h3>
          <p>Unable to save your bookmark to the server.</p>
          <p>
            <code>{toggleError.toString()}</code>
          </p>
          <a href={window.location.pathname}>Reload this page and try again.</a>
        </div>
      )}

      {unbookmarked && (
        <div className="unbookmark">
          <p>
            Bookmark removed{" "}
            <Button
              type="action"
              onClickHandler={async () => {
                try {
                  await saveBookmarked(unbookmarked.url);
                  setUnbookmarked(null);
                  if (toggleError) {
                    setToggleError(null);
                  }
                } catch (err: any) {
                  setToggleError(err);
                }
              }}
            >
              Undo
            </Button>
          </p>
        </div>
      )}

      {data.items.map((bookmark) => {
        return (
          <Bookmark
            key={bookmark.id}
            bookmark={bookmark}
            toggle={async () => {
              try {
                await saveBookmarked(bookmark.url);
                setUnbookmarked(bookmark);
                if (toggleError) {
                  setToggleError(null);
                }
              } catch (err: any) {
                setToggleError(err);
              }
            }}
          />
        );
      })}
      {(nextPage !== 0 || previousPage !== 0) && (
        <div className="pagination">
          {previousPage !== 0 && (
            <Link to={getPaginationURL(previousPage)}>Page {previousPage}</Link>
          )}{" "}
          {nextPage !== 0 && (
            <Link to={getPaginationURL(nextPage)}>Page {nextPage}</Link>
          )}
        </div>
      )}
    </>
  );
}

function Bookmark({
  bookmark,
  toggle,
}: {
  bookmark: BookmarkData;
  toggle: () => Promise<void>;
}) {
  const [doomed, setDoomed] = React.useState(false);

  let className = "bookmark";
  if (doomed) {
    className += " doomed";
  }

  return (
    <div key={bookmark.id} className={className}>
      <div className="bookmark-icon">docs</div>
      <div className="bookmark-content">
        {bookmark.parents.length > 0 && (
          <Breadcrumbs parents={bookmark.parents} />
        )}
        <h4>
          <a href={bookmark.url}>{bookmark.title}</a>
        </h4>
      </div>
      <div className="bookmark-actions">
        <Button
          type="action"
          icon="trash"
          title="Remove bookmark"
          onClickHandler={async () => {
            setDoomed(true);
            try {
              await toggle();
            } catch (error) {
              setDoomed(false);
            }
          }}
        >
          <span className="visually-hidden">Remove bookmark</span>
        </Button>
      </div>
    </div>
  );
}

function Breadcrumbs({ parents }: { parents: Breadcrumb[] }) {
  return (
    <ol className="breadcrumbs">
      {parents.map((parent, i) => {
        return (
          <li
            key={parent.uri}
            className={i + 1 === parents.length ? "last" : undefined}
          >
            <a href={parent.uri}>{parent.title}</a>
          </li>
        );
      })}
    </ol>
  );
}
